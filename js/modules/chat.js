/** Internal chat — private (admin↔user) and group messages */

import supabase from '../core/supabase.js';
import db from '../core/db.js';
import { generateId } from '../core/crypto.js';
import { getSession, isAdmin } from '../core/auth.js';
import { stripPlainText } from '../core/security.js';
import { applyDefaultTimestamps, fromDbRow, toDbRow } from '../core/db-mapper.js';
import {
  buildStoragePath,
  detectFileAttachmentType,
  isValidVideoLink,
  resolveDisplayAttachmentType,
  safeStorageFilename,
  uploadChatFile,
  validateChatFile,
} from './chat-attachments.js';

export const MAX_CHAT_BODY = 2000;
export const CHAT_POLL_MS = 12_000;
export const BADGE_POLL_MS = 15_000;

/**
 * @typedef {{ private: number, group: number }} ChatUnreadCounts
 * @typedef {{ file?: File | null, videoLink?: string | null }} ChatSendAttachment
 */

/**
 * @param {string} body
 * @param {ChatSendAttachment} [attachment]
 */
function validateMessagePayload(body, attachment = {}) {
  const text = stripPlainText(body ?? '');
  const hasText = text.length > 0;
  const hasFile = attachment.file instanceof File;
  const hasLink = typeof attachment.videoLink === 'string' && attachment.videoLink.trim().length > 0;

  if (!hasText && !hasFile && !hasLink) {
    throw new Error('CHAT_EMPTY');
  }
  if (text.length > MAX_CHAT_BODY) {
    throw new Error('CHAT_TOO_LONG');
  }
  if (hasFile) {
    validateChatFile(attachment.file);
  }
  if (hasLink && !isValidVideoLink(attachment.videoLink ?? '')) {
    throw new Error('CHAT_INVALID_VIDEO_LINK');
  }
  if (hasFile && hasLink) {
    throw new Error('CHAT_ONE_ATTACHMENT');
  }

  return { text, hasFile, hasLink };
}

/**
 * @param {'private' | 'group'} channel
 * @param {string} messageId
 * @param {string | null} threadUserId
 * @param {ChatSendAttachment} attachment
 * @returns {Promise<{ attachmentUrl: string | null, attachmentType: string | null, attachmentName: string | null, attachmentSize: number | null }>}
 */
async function resolveAttachmentFields(channel, messageId, threadUserId, attachment) {
  if (attachment.file instanceof File) {
    const file = attachment.file;
    const path = buildStoragePath(channel, messageId, threadUserId ?? '', file);
    await uploadChatFile(path, file);
    return {
      attachmentUrl: path,
      attachmentType: await detectFileAttachmentType(file),
      attachmentName: file.name || safeStorageFilename(file.name, file.type),
      attachmentSize: file.size,
    };
  }

  if (attachment.videoLink?.trim()) {
    return {
      attachmentUrl: attachment.videoLink.trim(),
      attachmentType: 'video_link',
      attachmentName: null,
      attachmentSize: null,
    };
  }

  return {
    attachmentUrl: null,
    attachmentType: null,
    attachmentName: null,
    attachmentSize: null,
  };
}

/**
 * @returns {Promise<ChatUnreadCounts>}
 */
export async function getUnreadCounts() {
  await db.init();
  const { data, error } = await supabase.rpc('get_chat_unread_counts');
  if (error) {
    throw new Error(`getUnreadCounts: ${error.message}`);
  }
  return {
    private: Number(data?.private ?? 0),
    group: Number(data?.group ?? 0),
  };
}

/**
 * @param {string} threadUserId
 * @returns {Promise<object[]>}
 */
export async function getPrivateMessages(threadUserId) {
  await db.init();
  const { data, error } = await supabase
    .from('private_messages')
    .select('*')
    .eq('thread_user_id', threadUserId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`getPrivateMessages: ${error.message}`);
  }

  return (data ?? []).map((row) => fromDbRow(row)).filter(Boolean);
}

/**
 * @returns {Promise<object[]>}
 */
export async function getAllPrivateMessages() {
  await db.init();
  const { data, error } = await supabase
    .from('private_messages')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`getAllPrivateMessages: ${error.message}`);
  }

  return (data ?? []).map((row) => fromDbRow(row)).filter(Boolean);
}

/**
 * @param {string} threadUserId
 * @param {string} body
 * @param {ChatSendAttachment} [attachment]
 * @returns {Promise<object>}
 */
export async function sendPrivateMessage(threadUserId, body, attachment = {}) {
  const { text } = validateMessagePayload(body, attachment);

  const session = getSession();
  if (!session?.userId) {
    throw new Error('Not authenticated');
  }

  const id = generateId('pmsg');
  const att = await resolveAttachmentFields('private', id, threadUserId, attachment);

  const record = applyDefaultTimestamps('privateMessages', {
    id,
    threadUserId,
    senderId: session.userId,
    body: text,
    createdAt: Date.now(),
    readAt: null,
    attachmentUrl: att.attachmentUrl,
    attachmentType: att.attachmentType,
    attachmentName: att.attachmentName,
    attachmentSize: att.attachmentSize,
  });

  const row = toDbRow('privateMessages', record);
  const { error } = await supabase.from('private_messages').insert(row);
  if (error) {
    throw new Error(`sendPrivateMessage: ${error.message}`);
  }

  return record;
}

/**
 * @param {string} threadUserId
 * @returns {Promise<void>}
 */
export async function markPrivateRead(threadUserId) {
  await db.init();
  const { error } = await supabase.rpc('mark_private_messages_read', {
    p_thread_user_id: threadUserId,
  });
  if (error) {
    throw new Error(`markPrivateRead: ${error.message}`);
  }
}

/**
 * @returns {Promise<object[]>}
 */
export async function getGroupMessages() {
  await db.init();
  const { data, error } = await supabase
    .from('group_messages')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`getGroupMessages: ${error.message}`);
  }

  return (data ?? []).map((row) => fromDbRow(row)).filter(Boolean);
}

/**
 * @param {string} body
 * @param {ChatSendAttachment} [attachment]
 * @returns {Promise<object>}
 */
export async function sendGroupMessage(body, attachment = {}) {
  const { text } = validateMessagePayload(body, attachment);

  const session = getSession();
  if (!session?.userId) {
    throw new Error('Not authenticated');
  }

  const id = generateId('gmsg');
  const att = await resolveAttachmentFields('group', id, null, attachment);

  const record = applyDefaultTimestamps('groupMessages', {
    id,
    senderId: session.userId,
    body: text,
    createdAt: Date.now(),
    attachmentUrl: att.attachmentUrl,
    attachmentType: att.attachmentType,
    attachmentName: att.attachmentName,
    attachmentSize: att.attachmentSize,
  });

  const row = toDbRow('groupMessages', record);
  const { error } = await supabase.from('group_messages').insert(row);
  if (error) {
    throw new Error(`sendGroupMessage: ${error.message}`);
  }

  return record;
}

/**
 * @returns {Promise<void>}
 */
export async function markGroupRead() {
  await db.init();
  const { error } = await supabase.rpc('mark_group_chat_read');
  if (error) {
    throw new Error(`markGroupRead: ${error.message}`);
  }
}

/**
 * @param {string} messageId
 * @returns {Promise<void>}
 */
export async function deleteGroupMessage(messageId) {
  await db.delete('groupMessages', messageId);
}

/**
 * @param {object} message
 * @returns {boolean}
 */
export function canDeleteGroupMessage(message) {
  if (isAdmin()) {
    return true;
  }
  const session = getSession();
  return Boolean(session?.userId && message.senderId === session.userId);
}

/**
 * @param {object[]} messages
 * @param {string} threadUserId
 * @returns {number}
 */
export function countPrivateUnread(messages, threadUserId) {
  if (isAdmin()) {
    return messages.filter(
      (m) => m.threadUserId === threadUserId && m.senderId === threadUserId && !m.readAt,
    ).length;
  }
  const session = getSession();
  return messages.filter(
    (m) => m.threadUserId === threadUserId && m.senderId !== session?.userId && !m.readAt,
  ).length;
}

/**
 * @param {object | null | undefined} msg
 * @param {(key: string) => string} t
 * @returns {string}
 */
export function messagePreviewText(msg, t) {
  if (!msg) {
    return '';
  }
  if (msg.body?.trim()) {
    return String(msg.body).slice(0, 60);
  }
  const displayType = resolveDisplayAttachmentType(msg);
  switch (displayType) {
    case 'image': return t('chat.previewImage');
    case 'video': return t('chat.previewVideo');
    case 'file': return t('chat.previewFile');
    case 'video_link': return t('chat.previewVideoLink');
    default: return t('chat.noMessagesYet');
  }
}

/**
 * @param {object[]} allMessages
 * @param {object[]} users
 * @param {(key: string) => string} [t]
 * @returns {Array<{ user: object, lastMessage: object | null, unread: number }>}
 */
export function buildAdminThreadList(allMessages, users, t = (k) => k) {
  const participants = users
    .filter((u) => u.status === 'active' && u.role !== 'admin')
    .sort((a, b) => (a.displayName ?? a.login ?? '').localeCompare(b.displayName ?? b.login ?? '', 'uk'));

  const summaries = participants.map((user) => {
    const threadMsgs = allMessages.filter((m) => m.threadUserId === user.id);
    const lastMessage = threadMsgs.length
      ? threadMsgs.reduce((a, b) => ((a.createdAt ?? 0) > (b.createdAt ?? 0) ? a : b))
      : null;
    return {
      user,
      lastMessage,
      unread: countPrivateUnread(allMessages, user.id),
      sortTime: lastMessage?.createdAt ?? 0,
    };
  });

  return summaries.sort((a, b) => {
    if (b.sortTime !== a.sortTime) {
      return b.sortTime - a.sortTime;
    }
    return (a.user.displayName ?? '').localeCompare(b.user.displayName ?? '', 'uk');
  });
}

export default {
  MAX_CHAT_BODY,
  CHAT_POLL_MS,
  BADGE_POLL_MS,
  getUnreadCounts,
  getPrivateMessages,
  getAllPrivateMessages,
  sendPrivateMessage,
  markPrivateRead,
  getGroupMessages,
  sendGroupMessage,
  markGroupRead,
  deleteGroupMessage,
  canDeleteGroupMessage,
  countPrivateUnread,
  messagePreviewText,
  buildAdminThreadList,
};
