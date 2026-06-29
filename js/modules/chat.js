/** Internal chat — private (admin↔user) and group messages */

import supabase from '../core/supabase.js';
import db from '../core/db.js';
import { generateId } from '../core/crypto.js';
import { getSession, isAdmin } from '../core/auth.js';
import { stripPlainText } from '../core/security.js';
import { applyDefaultTimestamps, fromDbRow, toDbRow } from '../core/db-mapper.js';

export const MAX_CHAT_BODY = 2000;
export const CHAT_POLL_MS = 12_000;
export const BADGE_POLL_MS = 15_000;

/**
 * @typedef {{ private: number, group: number }} ChatUnreadCounts
 */

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
 * @returns {Promise<object>}
 */
export async function sendPrivateMessage(threadUserId, body) {
  const text = stripPlainText(body);
  if (!text) {
    throw new Error('CHAT_EMPTY');
  }
  if (text.length > MAX_CHAT_BODY) {
    throw new Error('CHAT_TOO_LONG');
  }

  const session = getSession();
  if (!session?.userId) {
    throw new Error('Not authenticated');
  }

  const record = applyDefaultTimestamps('privateMessages', {
    id: generateId('pmsg'),
    threadUserId,
    senderId: session.userId,
    body: text,
    createdAt: Date.now(),
    readAt: null,
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
 * @returns {Promise<object>}
 */
export async function sendGroupMessage(body) {
  const text = stripPlainText(body);
  if (!text) {
    throw new Error('CHAT_EMPTY');
  }
  if (text.length > MAX_CHAT_BODY) {
    throw new Error('CHAT_TOO_LONG');
  }

  const session = getSession();
  if (!session?.userId) {
    throw new Error('Not authenticated');
  }

  const record = applyDefaultTimestamps('groupMessages', {
    id: generateId('gmsg'),
    senderId: session.userId,
    body: text,
    createdAt: Date.now(),
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
 * @param {object[]} allMessages
 * @param {object[]} users
 * @returns {Array<{ user: object, lastMessage: object | null, unread: number }>}
 */
export function buildAdminThreadList(allMessages, users) {
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
  buildAdminThreadList,
};
