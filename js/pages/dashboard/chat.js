/** Dashboard chat — private admin↔user threads + group room */

import { t, getDateLocale } from '../../core/i18n.js';
import { getSession, isAdmin } from '../../core/auth.js';
import { escapeHtml } from '../../core/security.js';
import db from '../../core/db.js';
import {
  CHAT_POLL_MS,
  MAX_CHAT_BODY,
  buildAdminThreadList,
  canDeleteGroupMessage,
  deleteGroupMessage,
  getAllPrivateMessages,
  getGroupMessages,
  getPrivateMessages,
  markGroupRead,
  markPrivateRead,
  sendGroupMessage,
  sendPrivateMessage,
} from '../../modules/chat.js';
import { refreshChatBadges } from '../../ui/chat-badges.js';
import { confirmModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';

/** @type {number | null} */
let pollTimer = null;
/** @type {'private' | 'group'} */
let activeTab = 'private';
/** @type {string | null} */
let activeThreadUserId = null;
/** @type {Map<string, object>} */
let userMap = new Map();
/** @type {boolean} */
let stickToBottom = true;

/**
 * @param {number | null | undefined} ts
 * @returns {string}
 */
function formatChatTime(ts) {
  if (!ts) {
    return '';
  }
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString(getDateLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * @param {string} userId
 * @returns {string}
 */
function displayName(userId) {
  const user = userMap.get(userId);
  return user?.displayName ?? user?.login ?? userId;
}

/**
 * @param {HTMLElement | null} el
 */
function scrollMessagesToBottom(el) {
  if (el && stickToBottom) {
    el.scrollTop = el.scrollHeight;
  }
}

/**
 * @param {HTMLElement} scrollEl
 */
function bindScrollStick(scrollEl) {
  scrollEl.addEventListener('scroll', () => {
    const nearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 80;
    stickToBottom = nearBottom;
  });
}

/**
 * @param {object[]} messages
 * @param {string} mode
 * @returns {string}
 */
function renderMessageBubbles(messages, mode) {
  const session = getSession();
  return messages.map((msg) => {
    const mine = msg.senderId === session?.userId;
    const align = mine ? 'ml-auto bg-pulse-violet/30' : 'mr-auto bg-space-void/80';
    const deleteBtn = mode === 'group' && canDeleteGroupMessage(msg)
      ? `<button type="button" data-delete-group-msg="${escapeHtml(msg.id)}"
          class="mt-1 text-xs text-dim-text hover:text-red-400">${t('chat.deleteMessage')}</button>`
      : '';

    return `
      <div class="max-w-[85%] rounded-lg border border-pulse-violet/15 px-3 py-2 ${align}" data-msg-id="${escapeHtml(msg.id)}">
        ${!mine ? `<p class="mb-1 text-xs font-medium text-neural-glow">${escapeHtml(displayName(msg.senderId))}</p>` : ''}
        <p class="whitespace-pre-wrap break-words text-sm text-starfield-white">${escapeHtml(msg.body ?? '')}</p>
        <p class="mt-1 text-right text-[10px] text-dim-text">${formatChatTime(msg.createdAt)}</p>
        ${deleteBtn}
      </div>
    `;
  }).join('');
}

/**
 * @param {string} html
 */
function renderComposer(html) {
  return `
    ${html}
    <form id="chat-compose-form" class="flex shrink-0 gap-2 border-t border-pulse-violet/20 p-3">
      <textarea id="chat-compose-input" rows="2" maxlength="${MAX_CHAT_BODY}"
        placeholder="${escapeHtml(t('chat.placeholder'))}"
        class="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2 text-sm outline-none focus:border-neural-glow"></textarea>
      <button type="submit"
        class="self-end rounded-lg bg-pulse-violet px-4 py-2 text-sm font-medium hover:shadow-[0_0_12px_rgba(124,58,237,0.35)]">
        ${t('chat.send')}
      </button>
    </form>
    <p id="chat-compose-error" class="hidden px-3 pb-2 text-sm text-red-400"></p>
  `;
}

/**
 * @param {Array<{ user: object, lastMessage: object | null, unread: number }>} threads
 * @returns {string}
 */
function renderThreadList(threads) {
  if (threads.length === 0) {
    return `<p class="p-4 text-sm text-dim-text">${escapeHtml(t('chat.noThreads'))}</p>`;
  }

  return threads.map(({ user, lastMessage, unread }) => {
    const active = activeThreadUserId === user.id;
    const preview = lastMessage?.body
      ? escapeHtml(String(lastMessage.body).slice(0, 60))
      : escapeHtml(t('chat.noMessagesYet'));
    const badge = unread > 0
      ? `<span class="rounded-full bg-pulse-violet px-1.5 py-0.5 text-xs font-semibold text-white">${unread > 99 ? '99+' : unread}</span>`
      : '';

    return `
      <button type="button" data-thread-user="${escapeHtml(user.id)}"
        class="flex w-full items-start gap-2 border-b border-pulse-violet/10 px-3 py-3 text-left text-sm transition hover:bg-pulse-violet/10 ${active ? 'bg-pulse-violet/15' : ''}">
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium text-starfield-white">${escapeHtml(user.displayName ?? user.login)}</span>
          <span class="mt-0.5 block truncate text-xs text-dim-text">${preview}</span>
        </span>
        <span class="flex shrink-0 flex-col items-end gap-1">
          ${lastMessage ? `<span class="text-[10px] text-dim-text">${formatChatTime(lastMessage.createdAt)}</span>` : ''}
          ${badge}
        </span>
      </button>
    `;
  }).join('');
}

async function loadUsers() {
  const users = await db.getAll('users');
  userMap = new Map(users.map((u) => [u.id, u]));
}

function parseInitialState(ctx) {
  const params = new URLSearchParams(window.location.search);
  activeTab = params.get('tab') === 'group' ? 'group' : 'private';
  const userParam = params.get('user');
  if (isAdmin() && userParam) {
    activeThreadUserId = userParam;
  } else if (!isAdmin()) {
    activeThreadUserId = getSession()?.userId ?? null;
  }
}

/**
 * @param {{ navigate: (path: string, replace?: boolean) => Promise<void> }} ctx
 */
async function renderPrivatePane(ctx) {
  const session = getSession();
  if (!session?.userId) {
    return;
  }

  const threadId = isAdmin() ? activeThreadUserId : session.userId;
  if (!threadId) {
    document.getElementById('chat-messages')?.replaceChildren();
    const empty = document.getElementById('chat-messages');
    if (empty) {
      empty.innerHTML = `<p class="p-4 text-sm text-dim-text">${escapeHtml(t('chat.selectThread'))}</p>`;
    }
    return;
  }

  const messages = await getPrivateMessages(threadId);
  await markPrivateRead(threadId);
  void refreshChatBadges();

  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) {
    return;
  }

  const title = isAdmin()
    ? displayName(threadId)
    : t('chat.adminThread');

  const titleEl = document.getElementById('chat-pane-title');
  if (titleEl) {
    titleEl.textContent = title;
  }

  messagesEl.innerHTML = messages.length
    ? renderMessageBubbles(messages, 'private')
    : `<p class="text-sm text-dim-text">${escapeHtml(t('chat.noMessagesYet'))}</p>`;

  scrollMessagesToBottom(messagesEl);
}

async function renderGroupPane() {
  const messages = await getGroupMessages();
  await markGroupRead();
  void refreshChatBadges();

  const messagesEl = document.getElementById('chat-messages');
  const titleEl = document.getElementById('chat-pane-title');
  if (titleEl) {
    titleEl.textContent = t('chat.groupTitle');
  }
  if (!messagesEl) {
    return;
  }

  messagesEl.innerHTML = messages.length
    ? renderMessageBubbles(messages, 'group')
    : `<p class="text-sm text-dim-text">${escapeHtml(t('chat.noMessagesYet'))}</p>`;

  messagesEl.querySelectorAll('[data-delete-group-msg]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-group-msg');
      if (!id || !await confirmModal(t('chat.deleteConfirm'))) {
        return;
      }
      try {
        await deleteGroupMessage(id);
        await renderGroupPane();
        showToast(t('chat.messageDeleted'), 'info');
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('chat.deleteError'), 'error');
      }
    });
  });

  scrollMessagesToBottom(messagesEl);
}

async function renderThreadSidebar() {
  const sidebar = document.getElementById('chat-thread-list');
  if (!sidebar || !isAdmin()) {
    return;
  }

  const allMessages = await getAllPrivateMessages();
  const users = [...userMap.values()];
  const threads = buildAdminThreadList(allMessages, users);

  if (!activeThreadUserId && threads.length > 0) {
    activeThreadUserId = threads[0].user.id;
  }

  sidebar.innerHTML = renderThreadList(threads);

  sidebar.querySelectorAll('[data-thread-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      activeThreadUserId = btn.getAttribute('data-thread-user');
      const url = `/dashboard/chat?tab=private&user=${encodeURIComponent(activeThreadUserId ?? '')}`;
      window.history.replaceState(null, '', url);
      await renderThreadSidebar();
      await renderPrivatePane({ navigate: () => Promise.resolve() });
    });
  });
}

async function refreshActivePane(ctx) {
  if (activeTab === 'group') {
    await renderGroupPane();
  } else {
    await renderPrivatePane(ctx);
    if (isAdmin()) {
      await renderThreadSidebar();
    }
  }
}

/**
 * @param {{ navigate: (path: string, replace?: boolean) => Promise<void> }} ctx
 */
async function buildLayout(ctx) {
  const root = document.getElementById('chat-app');
  if (!root) {
    return;
  }

  const adminList = isAdmin()
    ? `<aside id="chat-thread-list" class="flex w-full shrink-0 flex-col overflow-y-auto border-b border-pulse-violet/20 md:w-64 md:border-b-0 md:border-r"></aside>`
    : '';

  root.innerHTML = `
    <div class="flex shrink-0 border-b border-pulse-violet/20">
      <button type="button" data-chat-tab="private"
        class="chat-tab flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm transition md:flex-none md:px-6">
        ${t('chat.tabPrivate')}
        <span data-chat-badge-private class="hidden"></span>
      </button>
      <button type="button" data-chat-tab="group"
        class="chat-tab flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm transition md:flex-none md:px-6">
        ${t('chat.tabGroup')}
        <span data-chat-badge-group class="hidden"></span>
      </button>
    </div>
    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      ${adminList}
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="shrink-0 border-b border-pulse-violet/15 px-4 py-2">
          <h2 id="chat-pane-title" class="text-sm font-medium text-neural-glow"></h2>
        </div>
        <div id="chat-messages" class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"></div>
        ${renderComposer('')}
      </div>
    </div>
  `;

  updateTabStyles();
  void refreshChatBadges();

  const scrollEl = document.getElementById('chat-messages');
  if (scrollEl) {
    bindScrollStick(scrollEl);
  }

  document.querySelectorAll('[data-chat-tab]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tab = btn.getAttribute('data-chat-tab');
      activeTab = tab === 'group' ? 'group' : 'private';
      const url = activeTab === 'group'
        ? '/dashboard/chat?tab=group'
        : `/dashboard/chat?tab=private${activeThreadUserId && isAdmin() ? `&user=${encodeURIComponent(activeThreadUserId)}` : ''}`;
      window.history.replaceState(null, '', url);
      updateTabStyles();
      stickToBottom = true;
      await refreshActivePane(ctx);
    });
  });

  document.getElementById('chat-compose-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-compose-input');
    const errorEl = document.getElementById('chat-compose-error');
    const text = input instanceof HTMLTextAreaElement ? input.value : '';

    if (errorEl) {
      errorEl.classList.add('hidden');
      errorEl.textContent = '';
    }

    try {
      if (activeTab === 'group') {
        await sendGroupMessage(text);
      } else {
        const threadId = isAdmin() ? activeThreadUserId : getSession()?.userId;
        if (!threadId) {
          throw new Error(t('chat.selectThread'));
        }
        await sendPrivateMessage(threadId, text);
      }
      if (input instanceof HTMLTextAreaElement) {
        input.value = '';
      }
      stickToBottom = true;
      await refreshActivePane(ctx);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const message = code === 'CHAT_EMPTY'
        ? t('chat.emptyBody')
        : code === 'CHAT_TOO_LONG'
          ? t('chat.tooLong')
          : (error instanceof Error ? error.message : t('chat.sendError'));
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
      }
    }
  });

  await refreshActivePane(ctx);
}

function updateTabStyles() {
  document.querySelectorAll('[data-chat-tab]').forEach((btn) => {
    const tab = btn.getAttribute('data-chat-tab');
    const on = (tab === 'group' && activeTab === 'group') || (tab === 'private' && activeTab === 'private');
    btn.classList.toggle('bg-pulse-violet/20', on);
    btn.classList.toggle('text-neural-glow', on);
    btn.classList.toggle('text-dim-text', !on);
  });
}

function startPolling(ctx) {
  stopPolling();
  pollTimer = window.setInterval(() => {
    void refreshActivePane(ctx);
  }, CHAT_POLL_MS);
}

function stopPolling() {
  if (pollTimer != null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * @param {{ navigate: Function, path: string, signal?: AbortSignal }} ctx
 */
export default async function init(ctx) {
  parseInitialState(ctx);
  await loadUsers();

  if (!isAdmin() && activeTab === 'private') {
    activeThreadUserId = getSession()?.userId ?? null;
  }

  await buildLayout(ctx);
  startPolling(ctx);

  ctx.signal?.addEventListener('abort', stopPolling, { once: true });
}

export { stopPolling };
