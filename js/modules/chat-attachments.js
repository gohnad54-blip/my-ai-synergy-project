/** Chat file attachments — Storage upload, validation, signed URLs */

import supabase from '../core/supabase.js';
import { toVideoEmbedUrl } from '../ui/public.js';

export const CHAT_BUCKET = 'chat-attachments';
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

/**
 * @param {string} name
 * @returns {'image' | 'video' | 'file' | null}
 */
export function inferTypeFromFilename(name) {
  const n = String(name ?? '');
  if (IMAGE_EXT.test(n)) {
    return 'image';
  }
  if (VIDEO_EXT.test(n)) {
    return 'video';
  }
  return null;
}

/**
 * @param {object} msg
 * @returns {'image' | 'video' | 'file' | 'video_link' | null}
 */
export function resolveDisplayAttachmentType(msg) {
  const stored = msg.attachmentType;
  if (stored === 'video_link') {
    return 'video_link';
  }
  if (!msg.attachmentUrl) {
    return null;
  }

  const name = msg.attachmentName ?? msg.attachmentUrl.split('/').pop() ?? '';
  const inferred = inferTypeFromFilename(name);

  if (stored === 'image' || stored === 'video' || stored === 'file') {
    if (stored === 'file' && inferred) {
      return inferred;
    }
    return stored;
  }

  return inferred ?? 'file';
}

/**
 * @param {string} name
 * @returns {string}
 */
export function safeStorageFilename(name) {
  const base = String(name ?? 'file').split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[^\w.\-()+\u0400-\u04FF]/g, '_').replace(/_+/g, '_');
  return cleaned.slice(0, 120) || 'file';
}

/**
 * @param {File} file
 * @returns {'image' | 'video' | 'file'}
 */
export function detectFileAttachmentType(file) {
  const mime = (file.type ?? '').toLowerCase();
  const name = file.name ?? '';
  const fromName = inferTypeFromFilename(name);
  if (IMAGE_MIME.has(mime)) {
    return 'image';
  }
  if (VIDEO_MIME.has(mime)) {
    return 'video';
  }
  if (fromName) {
    return fromName;
  }
  return 'file';
}

/**
 * @param {File} file
 */
export function validateChatFile(file) {
  if (!(file instanceof File)) {
    throw new Error('CHAT_NO_FILE');
  }
  if (file.size <= 0) {
    throw new Error('CHAT_FILE_EMPTY');
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('CHAT_FILE_TOO_LARGE');
  }
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isValidVideoLink(url) {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return Boolean(toVideoEmbedUrl(url.trim()));
  } catch {
    return false;
  }
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) {
    return `${bytes || 0} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {'private' | 'group'} channel
 * @param {string} messageId
 * @param {string} threadUserId
 * @param {File} file
 * @returns {string}
 */
export function buildStoragePath(channel, messageId, threadUserId, file) {
  const filename = safeStorageFilename(file.name);
  if (channel === 'private') {
    return `private/${threadUserId}/${messageId}/${filename}`;
  }
  return `group/${messageId}/${filename}`;
}

/**
 * @param {string} path
 * @param {File} file
 * @returns {Promise<void>}
 */
export async function uploadChatFile(path, file) {
  const { error } = await supabase.storage.from(CHAT_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });
  if (error) {
    throw new Error(`uploadChatFile: ${error.message}`);
  }
}

/** @type {Map<string, { url: string, expires: number, isBlob?: boolean }>} */
const signedUrlCache = new Map();

/**
 * @param {string} storagePath
 * @returns {Promise<string | null>}
 */
async function downloadAsBlobUrl(storagePath) {
  const { data, error } = await supabase.storage.from(CHAT_BUCKET).download(storagePath);
  if (error || !data) {
    return null;
  }
  return URL.createObjectURL(data);
}

/**
 * @param {string | null | undefined} storagePath
 * @returns {Promise<string | null>}
 */
export async function getAttachmentSignedUrl(storagePath) {
  if (!storagePath || storagePath.includes('://')) {
    return storagePath ?? null;
  }

  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  if (cached?.isBlob) {
    URL.revokeObjectURL(cached.url);
    signedUrlCache.delete(storagePath);
  }

  const { data, error } = await supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (!error && data?.signedUrl) {
    signedUrlCache.set(storagePath, {
      url: data.signedUrl,
      expires: Date.now() + 3_500_000,
    });
    return data.signedUrl;
  }

  const blobUrl = await downloadAsBlobUrl(storagePath);
  if (blobUrl) {
    signedUrlCache.set(storagePath, {
      url: blobUrl,
      expires: Date.now() + 3_500_000,
      isBlob: true,
    });
    return blobUrl;
  }

  return null;
}

/**
 * @param {object} msg
 * @returns {boolean}
 */
export function isStorageAttachment(msg) {
  return Boolean(
    msg.attachmentType
    && msg.attachmentType !== 'video_link'
    && msg.attachmentUrl
    && !String(msg.attachmentUrl).includes('://'),
  );
}

/**
 * @param {object} msg
 * @returns {string}
 */
export function attachmentPreviewLabel(msg) {
  switch (msg.attachmentType) {
    case 'image': return '📷';
    case 'video': return '🎬';
    case 'file': return '📎';
    case 'video_link': return '🔗';
    default: return '';
  }
}

export default {
  CHAT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  safeStorageFilename,
  inferTypeFromFilename,
  resolveDisplayAttachmentType,
  detectFileAttachmentType,
  validateChatFile,
  isValidVideoLink,
  formatFileSize,
  buildStoragePath,
  uploadChatFile,
  getAttachmentSignedUrl,
  isStorageAttachment,
  attachmentPreviewLabel,
};
