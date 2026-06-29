/** Chat file attachments — Storage upload, validation, signed URLs */

import supabase from '../core/supabase.js';
import { toVideoEmbedUrl } from '../ui/public.js';

export const CHAT_BUCKET = 'chat-attachments';
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

/**
 * @param {object} msg
 * @returns {{
 *   attachmentType: string | null | undefined,
 *   attachmentUrl: string | null | undefined,
 *   attachmentName: string | null | undefined,
 * }}
 */
export function normalizeAttachmentFields(msg) {
  return {
    attachmentType: msg.attachmentType ?? msg.attachment_type,
    attachmentUrl: msg.attachmentUrl ?? msg.attachment_url,
    attachmentName: msg.attachmentName ?? msg.attachment_name,
  };
}

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
  const { attachmentType: stored, attachmentUrl, attachmentName } = normalizeAttachmentFields(msg);

  if (stored === 'video_link') {
    return 'video_link';
  }
  if (!attachmentUrl) {
    return null;
  }

  const pathName = String(attachmentUrl).split('/').pop() ?? '';
  const inferred = inferTypeFromFilename(attachmentName)
    ?? inferTypeFromFilename(pathName);

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
 * @param {string} [mime]
 * @returns {string}
 */
export function safeStorageFilename(name, mime = '') {
  const base = String(name ?? 'file').split(/[/\\]/).pop() ?? 'file';
  let cleaned = base.replace(/[^\w.\-()+\u0400-\u04FF]/g, '_').replace(/_+/g, '_');
  const lowerMime = (mime ?? '').toLowerCase();
  if (!inferTypeFromFilename(cleaned) && MIME_EXT[lowerMime]) {
    cleaned += MIME_EXT[lowerMime];
  }
  return cleaned.slice(0, 120) || 'file';
}

/**
 * @param {File} file
 * @returns {Promise<'image' | 'video' | 'file'>}
 */
async function sniffFileAttachmentType(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (head.length >= 3 && head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) {
      return 'image';
    }
    if (
      head.length >= 8
      && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47
      && head[4] === 0x0D && head[5] === 0x0A && head[6] === 0x1A && head[7] === 0x0A
    ) {
      return 'image';
    }
    if (head.length >= 6) {
      const riff = String.fromCharCode(head[0], head[1], head[2], head[3]);
      const webp = String.fromCharCode(head[8], head[9], head[10], head[11]);
      if (riff === 'RIFF' && webp === 'WEBP') {
        return 'image';
      }
    }
    if (
      head.length >= 6
      && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38
    ) {
      return 'image';
    }
    if (head.length >= 12) {
      const box = String.fromCharCode(head[4], head[5], head[6], head[7]);
      if (box === 'ftyp') {
        return 'video';
      }
    }
  } catch {
    /* ignore sniff errors */
  }
  return null;
}

/**
 * @param {File} file
 * @returns {Promise<'image' | 'video' | 'file'>}
 */
export async function detectFileAttachmentType(file) {
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
  const sniffed = await sniffFileAttachmentType(file);
  if (sniffed) {
    return sniffed;
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
  const filename = safeStorageFilename(file.name, file.type);
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
 * Blob URL for inline preview, lightbox, and <video> (uses authenticated download).
 * @param {string | null | undefined} storagePath
 * @returns {Promise<string | null>}
 */
export async function getAttachmentDisplayUrl(storagePath) {
  if (!storagePath || storagePath.includes('://')) {
    return storagePath ?? null;
  }

  const cacheKey = `display:${storagePath}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  if (cached?.isBlob) {
    URL.revokeObjectURL(cached.url);
    signedUrlCache.delete(cacheKey);
  }

  const blobUrl = await downloadAsBlobUrl(storagePath);
  if (blobUrl) {
    signedUrlCache.set(cacheKey, {
      url: blobUrl,
      expires: Date.now() + 3_500_000,
      isBlob: true,
    });
    return blobUrl;
  }

  return null;
}

/**
 * Signed URL for download / open in new tab.
 * @param {string | null | undefined} storagePath
 * @returns {Promise<string | null>}
 */
export async function getAttachmentSignedUrl(storagePath) {
  if (!storagePath || storagePath.includes('://')) {
    return storagePath ?? null;
  }

  const cacheKey = `signed:${storagePath}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (!error && data?.signedUrl) {
    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expires: Date.now() + 3_500_000,
    });
    return data.signedUrl;
  }

  return getAttachmentDisplayUrl(storagePath);
}

/**
 * @param {object} msg
 * @returns {boolean}
 */
export function isStorageAttachment(msg) {
  const { attachmentUrl } = normalizeAttachmentFields(msg);
  if (!attachmentUrl || String(attachmentUrl).includes('://')) {
    return false;
  }
  return resolveDisplayAttachmentType(msg) !== 'video_link';
}

/**
 * @param {object} msg
 * @returns {string}
 */
export function attachmentPreviewLabel(msg) {
  switch (resolveDisplayAttachmentType(msg)) {
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
  normalizeAttachmentFields,
  safeStorageFilename,
  inferTypeFromFilename,
  resolveDisplayAttachmentType,
  detectFileAttachmentType,
  validateChatFile,
  isValidVideoLink,
  formatFileSize,
  buildStoragePath,
  uploadChatFile,
  getAttachmentDisplayUrl,
  getAttachmentSignedUrl,
  isStorageAttachment,
  attachmentPreviewLabel,
};
