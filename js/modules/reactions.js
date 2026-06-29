/** Reactions on comments and chat messages */

import supabase from '../core/supabase.js';
import db from '../core/db.js';
import { generateId } from '../core/crypto.js';
import { getSession } from '../core/auth.js';
import { getGuestCommentCode } from '../core/guest-comment.js';
import { applyDefaultTimestamps, fromDbRow, toDbRow } from '../core/db-mapper.js';

/** @typedef {'comment' | 'private_message' | 'group_message'} ReactionTargetType */
/** @typedef {'thumbs_up' | 'thumbs_down' | 'heart' | 'laugh' | 'wow' | 'sad'} ReactionKey */

/** @type {readonly ReactionKey[]} */
export const REACTION_KEYS = [
  'thumbs_up',
  'thumbs_down',
  'heart',
  'laugh',
  'wow',
  'sad',
];

/** @type {Record<ReactionKey, string>} */
export const REACTION_EMOJI = {
  thumbs_up: '👍',
  thumbs_down: '👎',
  heart: '❤️',
  laugh: '😂',
  wow: '😮',
  sad: '😢',
};

/**
 * @returns {{ userId: string | null, guestCode: string | null }}
 */
export function getReactionActor() {
  const session = getSession();
  if (session?.userId) {
    return { userId: session.userId, guestCode: null };
  }
  return { userId: null, guestCode: getGuestCommentCode() };
}

/**
 * @param {ReactionTargetType} targetType
 * @returns {boolean}
 */
export function canReactOnTarget(targetType) {
  if (targetType === 'comment') {
    return true;
  }
  return Boolean(getSession()?.userId);
}

/**
 * @param {object} row
 * @param {{ userId: string | null, guestCode: string | null }} actor
 * @returns {boolean}
 */
export function isReactionMine(row, actor) {
  if (actor.userId) {
    return row.userId === actor.userId;
  }
  return row.guestCode != null && row.guestCode === actor.guestCode;
}

/**
 * @returns {{ counts: Record<string, number>, mine: ReactionKey | null, mineId: string | null }}
 */
export function emptyReactionSummary() {
  return { counts: {}, mine: null, mineId: null };
}

/**
 * @param {object[]} rows
 * @param {{ userId: string | null, guestCode: string | null }} [actor]
 * @returns {Map<string, { counts: Record<string, number>, mine: ReactionKey | null, mineId: string | null }>}
 */
export function summarizeReactions(rows, actor = getReactionActor()) {
  /** @type {Map<string, { counts: Record<string, number>, mine: ReactionKey | null, mineId: string | null }>} */
  const map = new Map();

  for (const row of rows) {
    const targetId = row.targetId;
    if (!targetId) {
      continue;
    }
    if (!map.has(targetId)) {
      map.set(targetId, emptyReactionSummary());
    }
    const summary = map.get(targetId);
    const key = row.reaction;
    if (key) {
      summary.counts[key] = (summary.counts[key] ?? 0) + 1;
    }
    if (isReactionMine(row, actor)) {
      summary.mine = /** @type {ReactionKey} */ (row.reaction);
      summary.mineId = row.id;
    }
  }

  return map;
}

/**
 * @param {ReactionTargetType} targetType
 * @param {string[]} targetIds
 * @returns {Promise<object[]>}
 */
export async function fetchReactions(targetType, targetIds) {
  const ids = [...new Set(targetIds.filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }

  await db.init();
  const { data, error } = await supabase
    .from('reactions')
    .select('*')
    .eq('target_type', targetType)
    .in('target_id', ids);

  if (error) {
    throw new Error(`fetchReactions: ${error.message}`);
  }

  return (data ?? []).map((row) => fromDbRow(row)).filter(Boolean);
}

/**
 * @param {ReactionTargetType} targetType
 * @param {string} targetId
 * @returns {Promise<object | null>}
 */
async function findMyReaction(targetType, targetId) {
  const actor = getReactionActor();
  const rows = await fetchReactions(targetType, [targetId]);
  return rows.find((row) => isReactionMine(row, actor)) ?? null;
}

/**
 * @param {ReactionTargetType} targetType
 * @param {string} targetId
 * @param {ReactionKey} reactionKey
 * @returns {Promise<ReactionKey | null>} active reaction after toggle, null if removed
 */
export async function toggleReaction(targetType, targetId, reactionKey) {
  if (!REACTION_KEYS.includes(reactionKey)) {
    throw new Error('REACTION_INVALID');
  }
  if (!canReactOnTarget(targetType)) {
    throw new Error('REACTION_AUTH_REQUIRED');
  }

  await db.init();
  const existing = await findMyReaction(targetType, targetId);
  const now = Date.now();

  if (existing) {
    if (existing.reaction === reactionKey) {
      const { error } = await supabase.from('reactions').delete().eq('id', existing.id);
      if (error) {
        throw new Error(`toggleReaction: ${error.message}`);
      }
      return null;
    }

    const { error } = await supabase
      .from('reactions')
      .update({ reaction: reactionKey, updated_at: now })
      .eq('id', existing.id);

    if (error) {
      throw new Error(`toggleReaction: ${error.message}`);
    }
    return reactionKey;
  }

  const actor = getReactionActor();
  const record = applyDefaultTimestamps('reactions', {
    id: generateId('react'),
    targetType,
    targetId,
    reaction: reactionKey,
    userId: actor.userId,
    guestCode: actor.guestCode,
    createdAt: now,
    updatedAt: now,
  });

  const row = toDbRow('reactions', record);
  const { error } = await supabase.from('reactions').insert(row);
  if (error) {
    throw new Error(`toggleReaction: ${error.message}`);
  }

  return reactionKey;
}

/**
 * @param {ReactionTargetType} targetType
 * @param {string} targetId
 * @returns {Promise<{ counts: Record<string, number>, mine: ReactionKey | null, mineId: string | null }>}
 */
export async function getReactionSummary(targetType, targetId) {
  const rows = await fetchReactions(targetType, [targetId]);
  return summarizeReactions(rows).get(targetId) ?? emptyReactionSummary();
}

export default {
  REACTION_KEYS,
  REACTION_EMOJI,
  getReactionActor,
  canReactOnTarget,
  isReactionMine,
  emptyReactionSummary,
  summarizeReactions,
  fetchReactions,
  toggleReaction,
  getReactionSummary,
};
