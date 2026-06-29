/** Chat unread badges — sidebar / header polling */

import { BADGE_POLL_MS, getUnreadCounts } from '../modules/chat.js';

/** @type {number | null} */
let pollTimer = null;

/**
 * @param {number} count
 * @returns {string}
 */
function badgeHtml(count) {
  if (count <= 0) {
    return '';
  }
  const label = count > 99 ? '99+' : String(count);
  return `<span class="chat-unread-badge ml-auto inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-pulse-violet px-1.5 text-xs font-semibold text-white" aria-label="${label}">${label}</span>`;
}

/**
 * @param {{ private: number, group: number }} counts
 */
export function applyChatBadges(counts) {
  const total = counts.private + counts.group;
  document.querySelectorAll('[data-nav-chat-badge]').forEach((el) => {
    if (total <= 0) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    const label = total > 99 ? '99+' : String(total);
    el.textContent = label;
    el.classList.remove('hidden');
  });

  document.querySelectorAll('[data-chat-badge-private]').forEach((el) => {
    if (counts.private <= 0) {
      el.innerHTML = '';
      el.classList.add('hidden');
    } else {
      el.innerHTML = badgeHtml(counts.private);
      el.classList.remove('hidden');
    }
  });

  document.querySelectorAll('[data-chat-badge-group]').forEach((el) => {
    if (counts.group <= 0) {
      el.innerHTML = '';
      el.classList.add('hidden');
    } else {
      el.innerHTML = badgeHtml(counts.group);
      el.classList.remove('hidden');
    }
  });
}

/**
 * @returns {Promise<void>}
 */
export async function refreshChatBadges() {
  try {
    const counts = await getUnreadCounts();
    applyChatBadges(counts);
  } catch {
    /* ignore when offline or not authenticated */
  }
}

/** Start polling unread counts on dashboard. */
export function startChatBadgePolling() {
  stopChatBadgePolling();
  void refreshChatBadges();
  pollTimer = window.setInterval(() => {
    void refreshChatBadges();
  }, BADGE_POLL_MS);
}

/** Stop badge polling when leaving dashboard. */
export function stopChatBadgePolling() {
  if (pollTimer != null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

export default {
  applyChatBadges,
  refreshChatBadges,
  startChatBadgePolling,
  stopChatBadgePolling,
};
