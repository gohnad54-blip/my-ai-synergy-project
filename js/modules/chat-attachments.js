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
  if (IMAGE_MIME.has(mime) || IMAGE_EXT.test(name)) {
    return 'image';
  }
  if (VIDEO_MIME.has(mime) || VIDEO_EXT.test(name)) {
    return 'video';
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

/** @type {Map<string, { url: string, expires: number }>} */
const signedUrlCache = new Map();

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

  const { data, error } = await supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    return null;
  }

  signedUrlCache.set(storagePath, {
    url: data.signedUrl,
    expires: Date.now() + 3_500_000,
  });

  return data.signedUrl;
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
