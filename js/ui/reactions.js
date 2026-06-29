/** Shared reactions UI — picker, chips, event delegation */

import { t } from '../core/i18n.js';
import { escapeHtml } from '../core/security.js';
import {
  REACTION_EMOJI,
  REACTION_KEYS,
  canReactOnTarget,
  fetchReactions,
  getReactionActor,
  summarizeReactions,
  toggleReaction,
} from '../modules/reactions.js';
import { showToast } from './toast.js';

/** @type {WeakSet<HTMLElement>} */
const boundContainers = new WeakSet();

/**
 * @param {import('../modules/reactions.js').ReactionTargetType} targetType
 * @param {string} targetId
 * @param {{ counts: Record<string, number>, mine: string | null }} summary
 * @param {boolean} [canReact]
 * @returns {string}
 */
export function renderReactionsBar(targetType, targetId, summary, canReact = canReactOnTarget(targetType)) {
  const chips = REACTION_KEYS
    .filter((key) => (summary.counts[key] ?? 0) > 0)
    .map((key) => {
      const count = summary.counts[key] ?? 0;
      const mine = summary.mine === key;
      const mineAttr = mine ? ' data-reaction-mine="1"' : '';
      const mineClass = mine
        ? 'ring-1 ring-neural-glow/80 bg-pulse-violet/30 text-starfield-white'
        : 'bg-space-void/50 text-dim-text hover:bg-space-void/80';
      return `<button type="button" data-reaction-chip="${key}"${mineAttr}
        class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs leading-none ${mineClass}"
        title="${escapeHtml(REACTION_EMOJI[key])}">${REACTION_EMOJI[key]} <span>${count}</span></button>`;
    })
    .join('');

  const picker = canReact
    ? `<div data-reactions-picker class="hidden flex flex-wrap items-center gap-0.5 rounded-full border border-pulse-violet/30 bg-space-void px-1 py-0.5 shadow-lg">
        ${REACTION_KEYS.map((key) => `
          <button type="button" data-reaction-pick="${key}"
            class="rounded-full px-1.5 py-0.5 text-base leading-none hover:bg-pulse-violet/25"
            title="${escapeHtml(REACTION_EMOJI[key])}">${REACTION_EMOJI[key]}</button>
        `).join('')}
      </div>`
    : '';

  const addBtn = canReact
    ? `<button type="button" data-reactions-add
        class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-pulse-violet/25 text-sm text-dim-text hover:border-neural-glow hover:text-neural-glow"
        aria-label="${escapeHtml(t('reactions.add'))}">+</button>`
    : '';

  if (!addBtn && !chips) {
    return '';
  }

  return `
    <div class="reactions-bar relative mt-2 flex flex-wrap items-center gap-1"
      data-reactions-target="${escapeHtml(targetType)}"
      data-reactions-id="${escapeHtml(targetId)}">
      ${addBtn}
      ${picker}
      ${chips}
    </div>
  `;
}

/**
 * @param {HTMLElement} bar
 * @param {import('../modules/reactions.js').ReactionTargetType} targetType
 */
async function refreshReactionsBar(bar) {
  const targetId = bar.getAttribute('data-reactions-id');
  if (!targetId) {
    return;
  }

  const rows = await fetchReactions(targetType, [targetId]);
  const summary = summarizeReactions(rows, getReactionActor()).get(targetId)
    ?? { counts: {}, mine: null, mineId: null };
  const canReact = canReactOnTarget(targetType);
  const html = renderReactionsBar(targetType, targetId, summary, canReact);

  if (!html) {
    bar.remove();
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const next = wrapper.firstElementChild;
  if (next instanceof HTMLElement) {
    bar.replaceWith(next);
  }
}

function closeAllReactionPickers() {
  document.querySelectorAll('[data-reactions-picker]').forEach((picker) => {
    picker.classList.add('hidden');
  });
}

/**
 * @param {Error} error
 */
function handleReactionError(error) {
  const code = error instanceof Error ? error.message : '';
  if (code.includes('rate') || code.includes('limit')) {
    showToast(t('reactions.rateLimit'), 'error');
    return;
  }
  if (code === 'REACTION_AUTH_REQUIRED') {
    showToast(t('reactions.authRequired'), 'error');
    return;
  }
  showToast(error instanceof Error ? error.message : t('reactions.error'), 'error');
}

/**
 * @param {HTMLElement} container
 */
export function bindReactions(container) {
  if (!container || boundContainers.has(container)) {
    return;
  }
  boundContainers.add(container);

  container.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const bar = target.closest('.reactions-bar');
    if (!(bar instanceof HTMLElement) || !container.contains(bar)) {
      return;
    }

    const targetType = /** @type {import('../modules/reactions.js').ReactionTargetType | null} */ (
      bar.getAttribute('data-reactions-target')
    );
    const targetId = bar.getAttribute('data-reactions-id');
    if (!targetType || !targetId) {
      return;
    }

    const pickBtn = target.closest('[data-reaction-pick]');
    if (pickBtn instanceof HTMLElement) {
      e.preventDefault();
      e.stopPropagation();
      const key = pickBtn.getAttribute('data-reaction-pick');
      if (!key) {
        return;
      }
      closeAllReactionPickers();
      try {
        await toggleReaction(targetType, targetId, /** @type {import('../modules/reactions.js').ReactionKey} */ (key));
        await refreshReactionsBar(bar);
      } catch (error) {
        handleReactionError(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    const chipBtn = target.closest('[data-reaction-chip][data-reaction-mine]');
    if (chipBtn instanceof HTMLElement) {
      e.preventDefault();
      e.stopPropagation();
      const key = chipBtn.getAttribute('data-reaction-chip');
      if (!key) {
        return;
      }
      try {
        await toggleReaction(targetType, targetId, /** @type {import('../modules/reactions.js').ReactionKey} */ (key));
        await refreshReactionsBar(bar);
      } catch (error) {
        handleReactionError(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    const addBtn = target.closest('[data-reactions-add]');
    if (addBtn instanceof HTMLElement) {
      e.preventDefault();
      e.stopPropagation();
      const picker = bar.querySelector('[data-reactions-picker]');
      if (!(picker instanceof HTMLElement)) {
        return;
      }
      const willOpen = picker.classList.contains('hidden');
      closeAllReactionPickers();
      if (willOpen) {
        picker.classList.remove('hidden');
      }
    }
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('[data-reactions-add]') || target.closest('[data-reaction-pick]')) {
      return;
    }
    closeAllReactionPickers();
  });
}

export default {
  renderReactionsBar,
  bindReactions,
};
