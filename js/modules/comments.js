/** Comments on published materials */

import supabase from '../core/supabase.js';
import db from '../core/db.js';
import { generateId } from '../core/crypto.js';
import { getSession, isAdmin } from '../core/auth.js';
import { getGuestCommentCode, getGuestDisplayName } from '../core/guest-comment.js';
import { stripPlainText } from '../core/security.js';
import { fromDbRow } from '../core/db-mapper.js';

export const MAX_COMMENT_LENGTH = 1000;
export const RATE_LIMIT = 10;
export const RATE_WINDOW_MS = 60_000;

const RATE_KEY = 'ai-synergy-comment-rate';

/**
 * @param {object | null | undefined} material
 * @param {object | null | undefined} [session]
 * @returns {boolean}
 */
export function canCommentOnMaterial(material, session = getSession()) {
  const access = material?.commentsAccess ?? 'disabled';
  if (access === 'disabled') {
    return false;
  }
  if (access === 'authenticated') {
    return Boolean(session);
  }
  return access === 'all';
}

/**
 * @param {object | null | undefined} material
 * @returns {boolean}
 */
export function areCommentsVisible(material) {
  return (material?.commentsAccess ?? 'disabled') !== 'disabled';
}

/**
 * @returns {boolean}
 */
export function isRateLimitOk() {
  try {
    const now = Date.now();
    const recent = JSON.parse(sessionStorage.getItem(RATE_KEY) ?? '[]')
      .filter((/** @type {number} */ ts) => now - ts < RATE_WINDOW_MS);
    return recent.length < RATE_LIMIT;
  } catch {
    return true;
  }
}

function recordCommentSubmit() {
  try {
    const now = Date.now();
    const recent = JSON.parse(sessionStorage.getItem(RATE_KEY) ?? '[]')
      .filter((/** @type {number} */ ts) => now - ts < RATE_WINDOW_MS);
    recent.push(now);
    sessionStorage.setItem(RATE_KEY, JSON.stringify(recent));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} materialId
 * @returns {Promise<object[]>}
 */
export async function getCommentsForMaterial(materialId) {
  await db.init();
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('material_id', materialId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`getCommentsForMaterial: ${error.message}`);
  }

  return (data ?? []).map((row) => fromDbRow(row)).filter(Boolean);
}

/**
 * @param {string} materialId
 * @param {string} body
 * @returns {Promise<object>}
 */
export async function addComment(materialId, body) {
  const text = stripPlainText(body);
  if (!text) {
    throw new Error('COMMENT_EMPTY');
  }
  if (text.length > MAX_COMMENT_LENGTH) {
    throw new Error('COMMENT_TOO_LONG');
  }
  if (!isRateLimitOk()) {
    throw new Error('COMMENT_RATE_LIMIT');
  }

  const session = getSession();
  const record = session
    ? {
        id: generateId('com'),
        materialId,
        body: text,
        authorType: 'user',
        authorName: session.displayName ?? session.login ?? session.userId,
        userId: session.userId,
        guestCode: null,
        createdAt: Date.now(),
      }
    : {
        id: generateId('com'),
        materialId,
        body: text,
        authorType: 'guest',
        authorName: getGuestDisplayName(),
        userId: null,
        guestCode: getGuestCommentCode(),
        createdAt: Date.now(),
      };

  await db.put('comments', record);
  recordCommentSubmit();
  return record;
}

/**
 * @param {object} comment
 * @returns {boolean}
 */
export function canDeleteComment(comment) {
  if (isAdmin()) {
    return true;
  }

  const session = getSession();
  if (comment.authorType === 'user' && session?.userId && comment.userId === session.userId) {
    return true;
  }

  if (comment.authorType === 'guest' && comment.guestCode === getGuestCommentCode()) {
    return true;
  }

  return false;
}

/**
 * @param {string} commentId
 * @returns {Promise<void>}
 */
export async function deleteComment(commentId) {
  await db.delete('comments', commentId);
}

export default {
  MAX_COMMENT_LENGTH,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  canCommentOnMaterial,
  areCommentsVisible,
  isRateLimitOk,
  getCommentsForMaterial,
  addComment,
  canDeleteComment,
  deleteComment,
};
