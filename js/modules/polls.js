/** Group chat polls — Supabase RPC layer */

import supabase from '../core/supabase.js';
import db from '../core/db.js';
import { generateId } from '../core/crypto.js';
import { hasPermission } from '../core/auth.js';

export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 10;

/**
 * @typedef {'single' | 'multiple'} PollType
 * @typedef {{
 *   pollId: string,
 *   groupMessageId: string,
 *   question: string,
 *   pollType: PollType,
 *   status: 'active' | 'closed',
 *   createdAt: number,
 *   closesAt: number | null,
 *   closedAt: number | null,
 *   canManage: boolean,
 *   options: Array<{ id: string, label: string, position: number }>,
 * }} PollMeta
 * @typedef {{
 *   poll: PollMeta & { lockedAt?: number | null },
 *   options: Array<{ id: string, label: string, position: number, voteCount: number, percent: number }>,
 *   totalVoters: number,
 *   myOptionIds: string[],
 * }} PollResults
 */

/**
 * @returns {boolean}
 */
export function canCreatePolls() {
  return hasPermission('polls.create');
}

/**
 * @returns {boolean}
 */
export function canViewPollVoters() {
  return hasPermission('polls.view_voters');
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function parseOptionIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

/**
 * @param {unknown} row
 * @returns {PollMeta}
 */
function mapPollMeta(row) {
  const record = /** @type {Record<string, unknown>} */ (row);
  return {
    pollId: String(record.pollId ?? record.id ?? ''),
    groupMessageId: String(record.groupMessageId ?? ''),
    question: String(record.question ?? ''),
    pollType: record.pollType === 'multiple' ? 'multiple' : 'single',
    status: record.status === 'closed' ? 'closed' : 'active',
    createdAt: Number(record.createdAt ?? 0),
    closesAt: record.closesAt != null ? Number(record.closesAt) : null,
    closedAt: record.closedAt != null ? Number(record.closedAt) : null,
    canManage: Boolean(record.canManage),
    options: Array.isArray(record.options)
      ? record.options.map((opt) => {
        const o = /** @type {Record<string, unknown>} */ (opt);
        return {
          id: String(o.id ?? ''),
          label: String(o.label ?? ''),
          position: Number(o.position ?? 0),
        };
      })
      : [],
  };
}

/**
 * @param {unknown} data
 * @returns {PollResults}
 */
function mapPollResults(data) {
  const root = /** @type {Record<string, unknown>} */ (data ?? {});
  const pollRaw = /** @type {Record<string, unknown>} */ (root.poll ?? {});
  const poll = {
    ...mapPollMeta({
      pollId: pollRaw.id,
      groupMessageId: pollRaw.groupMessageId,
      question: pollRaw.question,
      pollType: pollRaw.pollType,
      status: pollRaw.status,
      createdAt: pollRaw.createdAt,
      closesAt: pollRaw.closesAt,
      closedAt: pollRaw.closedAt,
      canManage: pollRaw.canManage,
      options: [],
    }),
    lockedAt: pollRaw.lockedAt != null ? Number(pollRaw.lockedAt) : null,
  };

  const options = Array.isArray(root.options)
    ? root.options.map((opt) => {
      const o = /** @type {Record<string, unknown>} */ (opt);
      return {
        id: String(o.id ?? ''),
        label: String(o.label ?? ''),
        position: Number(o.position ?? 0),
        voteCount: Number(o.voteCount ?? 0),
        percent: Number(o.percent ?? 0),
      };
    })
    : [];

  return {
    poll,
    options,
    totalVoters: Number(root.totalVoters ?? 0),
    myOptionIds: parseOptionIds(root.myOptionIds),
  };
}

/**
 * @param {string[]} messageIds
 * @returns {Promise<PollMeta[]>}
 */
export async function getPollsForMessages(messageIds) {
  if (!messageIds.length) {
    return [];
  }

  await db.init();
  const { data, error } = await supabase.rpc('get_polls_for_messages', {
    p_message_ids: messageIds,
  });

  if (error) {
    throw new Error(`getPollsForMessages: ${error.message}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => mapPollMeta(row));
}

/**
 * @param {string} pollId
 * @returns {Promise<PollResults>}
 */
export async function getPollResults(pollId) {
  await db.init();
  const { data, error } = await supabase.rpc('get_poll_results', {
    p_poll_id: pollId,
  });

  if (error) {
    throw new Error(`getPollResults: ${error.message}`);
  }

  return mapPollResults(data);
}

/**
 * @param {string} pollId
 * @returns {Promise<{ voters: object[], notVoted: object[], history: object[] }>}
 */
export async function getPollVoterDetails(pollId) {
  await db.init();
  const { data, error } = await supabase.rpc('get_poll_voter_details', {
    p_poll_id: pollId,
  });

  if (error) {
    throw new Error(`getPollVoterDetails: ${error.message}`);
  }

  const root = /** @type {Record<string, unknown>} */ (data ?? {});
  return {
    voters: Array.isArray(root.voters) ? root.voters : [],
    notVoted: Array.isArray(root.notVoted) ? root.notVoted : [],
    history: Array.isArray(root.history) ? root.history : [],
  };
}

/**
 * @param {{
 *   question: string,
 *   pollType: PollType,
 *   optionLabels: string[],
 *   closesAt?: number | null,
 * }} input
 * @returns {Promise<{ pollId: string, messageId: string }>}
 */
export async function createGroupPoll(input) {
  const question = input.question.trim();
  const labels = input.optionLabels.map((l) => l.trim()).filter(Boolean);

  if (!question) {
    throw new Error('POLL_QUESTION_REQUIRED');
  }
  if (labels.length < MIN_POLL_OPTIONS || labels.length > MAX_POLL_OPTIONS) {
    throw new Error('POLL_OPTIONS_COUNT');
  }

  const messageId = generateId('gmsg');
  const pollId = generateId('poll');
  const optionIds = labels.map(() => generateId('popt'));

  await db.init();
  const { data, error } = await supabase.rpc('create_group_poll', {
    p_message_id: messageId,
    p_poll_id: pollId,
    p_question: question,
    p_poll_type: input.pollType,
    p_option_ids: optionIds,
    p_option_labels: labels,
    p_closes_at: input.closesAt ?? null,
  });

  if (error) {
    throw new Error(`createGroupPoll: ${error.message}`);
  }

  const result = /** @type {Record<string, unknown>} */ (data ?? {});
  return {
    pollId: String(result.pollId ?? pollId),
    messageId: String(result.messageId ?? messageId),
  };
}

/**
 * @param {string} pollId
 * @param {string[]} optionIds
 * @returns {Promise<void>}
 */
export async function castPollVote(pollId, optionIds) {
  if (!optionIds.length) {
    throw new Error('POLL_VOTE_REQUIRED');
  }

  await db.init();
  const { error } = await supabase.rpc('cast_poll_vote', {
    p_poll_id: pollId,
    p_option_ids: optionIds,
  });

  if (error) {
    throw new Error(`castPollVote: ${error.message}`);
  }
}

/**
 * @param {string} pollId
 * @returns {Promise<void>}
 */
export async function closeGroupPoll(pollId) {
  await db.init();
  const { error } = await supabase.rpc('close_group_poll', {
    p_poll_id: pollId,
  });

  if (error) {
    throw new Error(`closeGroupPoll: ${error.message}`);
  }
}

/**
 * @param {Error | string} error
 * @param {(key: string) => string} t
 * @returns {string}
 */
export function mapPollError(error, t) {
  const code = error instanceof Error ? error.message : String(error);
  if (code === 'POLL_QUESTION_REQUIRED') return t('polls.errorQuestion');
  if (code === 'POLL_OPTIONS_COUNT') return t('polls.errorOptionsCount');
  if (code === 'POLL_VOTE_REQUIRED') return t('polls.errorVoteRequired');
  if (code.includes('poll is closed')) return t('polls.errorClosed');
  if (code.includes('forbidden')) return t('polls.errorForbidden');
  return error instanceof Error ? error.message : t('polls.errorGeneric');
}

export default {
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
  canCreatePolls,
  canViewPollVoters,
  getPollsForMessages,
  getPollResults,
  getPollVoterDetails,
  createGroupPoll,
  castPollVote,
  closeGroupPoll,
  mapPollError,
};
