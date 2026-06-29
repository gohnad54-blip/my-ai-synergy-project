/** Comments section UI for public material page */

import { t } from '../core/i18n.js';
import { getSession } from '../core/auth.js';
import { getGuestDisplayName } from '../core/guest-comment.js';
import { escapeHtml, formatPublicDate } from './public.js';
import {
  MAX_COMMENT_LENGTH,
  addComment,
  areCommentsVisible,
  canCommentOnMaterial,
  canDeleteComment,
  deleteComment,
  getCommentsForMaterial,
  isRateLimitOk,
} from '../modules/comments.js';
import { fetchReactions, summarizeReactions } from '../modules/reactions.js';
import { bindReactions, renderReactionsBar } from './reactions.js';
import { showToast } from './toast.js';

/**
 * @param {object} comment
 * @param {{ counts: Record<string, number>, mine: string | null }} summary
 * @returns {string}
 */
function renderCommentItem(comment, summary = { counts: {}, mine: null }) {
  const deleteBtn = canDeleteComment(comment)
    ? `<button type="button" data-comment-delete="${escapeHtml(comment.id)}"
        class="text-xs text-dim-text hover:text-red-400">${t('comments.delete')}</button>`
    : '';

  const reactionsHtml = renderReactionsBar('comment', comment.id, summary);

  return `
    <li class="rounded-lg border border-pulse-violet/15 bg-nebula-deep/20 px-4 py-3" data-comment-id="${escapeHtml(comment.id)}">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <span class="text-sm font-medium text-neural-glow">${escapeHtml(comment.authorName ?? '')}</span>
        <time class="text-xs text-dim-text">${formatPublicDate(comment.createdAt)}</time>
      </div>
      <p class="mt-2 whitespace-pre-wrap break-words text-sm text-starfield-white">${escapeHtml(comment.body ?? '')}</p>
      ${reactionsHtml}
      ${deleteBtn ? `<div class="mt-2">${deleteBtn}</div>` : ''}
    </li>
  `;
}

/**
 * @param {object} material
 * @param {HTMLElement} container
 */
export async function mountCommentsSection(material, container) {
  if (!areCommentsVisible(material)) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  const session = getSession();
  const canComment = canCommentOnMaterial(material, session);
  let comments = [];

  try {
    comments = await getCommentsForMaterial(material.id);
  } catch (error) {
    container.innerHTML = `<p class="text-sm text-red-400">${t('comments.loadError')}</p>`;
    return;
  }

  let reactionMap = new Map();
  try {
    const rows = await fetchReactions('comment', comments.map((c) => c.id));
    reactionMap = summarizeReactions(rows);
  } catch {
    /* reactions optional — show comments without counts */
  }

  const guestHint = !session && canComment
    ? `<p class="mb-3 text-xs text-dim-text">${t('comments.guestAs', { name: escapeHtml(getGuestDisplayName()) })}</p>`
    : '';

  const authRequired = material.commentsAccess === 'authenticated' && !session
    ? `<p class="text-sm text-dim-text">${t('comments.loginRequired')}</p>`
    : '';

  const form = canComment
    ? `
      ${guestHint}
      <form id="comment-form" class="mt-4 space-y-3">
        <textarea id="comment-input" rows="3" maxlength="${MAX_COMMENT_LENGTH}"
          placeholder="${t('comments.placeholder')}"
          class="w-full rounded-lg border border-pulse-violet/30 bg-space-void px-4 py-3 text-sm outline-none focus:border-neural-glow"></textarea>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-xs text-dim-text"><span id="comment-char-count">0</span>/${MAX_COMMENT_LENGTH}</span>
          <button type="submit"
            class="rounded-lg bg-pulse-violet px-4 py-2 text-sm font-medium hover:shadow-[0_0_12px_rgba(124,58,237,0.35)]">
            ${t('comments.submit')}
          </button>
        </div>
        <p id="comment-form-error" class="hidden text-sm text-red-400"></p>
      </form>
    `
    : authRequired;

  container.innerHTML = `
    <section class="mt-12 border-t border-pulse-violet/20 pt-8">
      <h2 class="mb-4 font-display text-xl text-neural-glow">${t('comments.title')}</h2>
      <ul id="comments-list" class="space-y-3">
        ${comments.length
    ? comments.map((c) => renderCommentItem(c, reactionMap.get(c.id) ?? { counts: {}, mine: null })).join('')
    : `<li class="text-sm text-dim-text" id="comments-empty">${t('comments.empty')}</li>`}
      </ul>
      ${form}
    </section>
  `;

  const list = document.getElementById('comments-list');
  if (list) {
    bindReactions(list);
  }

  const formEl = document.getElementById('comment-form');
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('comment-input'));
  const charCount = document.getElementById('comment-char-count');
  const formError = document.getElementById('comment-form-error');

  list?.querySelectorAll('[data-comment-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-comment-delete');
      if (!id || !confirm(t('comments.deleteConfirm'))) {
        return;
      }
      try {
        await deleteComment(id);
        list.querySelector(`[data-comment-id="${id}"]`)?.remove();
        if (!list.querySelector('[data-comment-id]')) {
          list.innerHTML = `<li class="text-sm text-dim-text" id="comments-empty">${t('comments.empty')}</li>`;
        }
        showToast(t('comments.deleted'), 'info');
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('comments.deleteError'), 'error');
      }
    });
  });

  if (!formEl || !input) {
    return;
  }

  input.addEventListener('input', () => {
    if (charCount) {
      charCount.textContent = String(input.value.length);
    }
  });

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (formError) {
      formError.classList.add('hidden');
      formError.textContent = '';
    }

    if (!isRateLimitOk()) {
      if (formError) {
        formError.textContent = t('comments.rateLimit');
        formError.classList.remove('hidden');
      }
      return;
    }

    try {
      const comment = await addComment(material.id, input.value);
      document.getElementById('comments-empty')?.remove();
      list?.insertAdjacentHTML('beforeend', renderCommentItem(comment, { counts: {}, mine: null }));
      const newItem = list?.lastElementChild;
      newItem?.querySelector('[data-comment-delete]')?.addEventListener('click', async () => {
        if (!confirm(t('comments.deleteConfirm'))) {
          return;
        }
        try {
          await deleteComment(comment.id);
          newItem.remove();
          if (!list?.querySelector('[data-comment-id]')) {
            list.innerHTML = `<li class="text-sm text-dim-text" id="comments-empty">${t('comments.empty')}</li>`;
          }
          showToast(t('comments.deleted'), 'info');
        } catch (error) {
          showToast(error instanceof Error ? error.message : t('comments.deleteError'), 'error');
        }
      });
      input.value = '';
      if (charCount) {
        charCount.textContent = '0';
      }
      showToast(t('comments.added'), 'success');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const message = code === 'COMMENT_RATE_LIMIT'
        ? t('comments.rateLimit')
        : code === 'COMMENT_TOO_LONG'
          ? t('comments.tooLong')
          : code === 'COMMENT_EMPTY'
            ? t('comments.emptyBody')
            : (error instanceof Error ? error.message : t('comments.submitError'));
      if (formError) {
        formError.textContent = message;
        formError.classList.remove('hidden');
      }
    }
  });
}
