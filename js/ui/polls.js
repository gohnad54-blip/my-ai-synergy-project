/** Group chat poll widgets */

import { escapeHtml } from '../core/security.js';
import { t, getDateLocale } from '../core/i18n.js';
import {
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  canViewPollVoters,
  castPollVote,
  closeGroupPoll,
  createGroupPoll,
  getPollResults,
  getPollVoterDetails,
  getPollsForMessages,
  mapPollError,
} from '../modules/polls.js';
import { closeModal, confirmModal, showModal } from './modal.js';
import { showToast } from './toast.js';

/** @type {WeakSet<HTMLElement>} */
const boundPollContainers = new WeakSet();

/**
 * @param {number | null | undefined} ts
 * @returns {string}
 */
function formatPollTime(ts) {
  if (!ts) {
    return '';
  }
  return new Date(ts).toLocaleString(getDateLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * @param {import('../modules/polls.js').PollResults} results
 * @returns {string}
 */
function renderPollStatusBadge(results) {
  if (results.poll.status === 'closed') {
    return `<span class="rounded-full bg-dim-text/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-dim-text">${escapeHtml(t('polls.closed'))}</span>`;
  }
  if (results.poll.closesAt) {
    return `<span class="text-[10px] text-dim-text">${escapeHtml(t('polls.closesAt', { time: formatPollTime(results.poll.closesAt) }))}</span>`;
  }
  return `<span class="rounded-full bg-success/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-success">${escapeHtml(t('polls.active'))}</span>`;
}

/**
 * @param {import('../modules/polls.js').PollResults} results
 * @returns {string}
 */
export function renderPollWidgetHtml(results) {
  const isActive = results.poll.status === 'active';
  const isSingle = results.poll.pollType === 'single';
  const mySet = new Set(results.myOptionIds);
  const inputType = isSingle ? 'radio' : 'checkbox';
  const inputName = isSingle ? `poll-${results.poll.pollId}` : undefined;

  const optionsHtml = results.options.map((opt) => {
    const checked = mySet.has(opt.id) ? ' checked' : '';
    const disabled = isActive ? '' : ' disabled';
    const nameAttr = inputName ? ` name="${escapeHtml(inputName)}"` : '';
    const input = isActive
      ? `<input type="${inputType}" value="${escapeHtml(opt.id)}" data-poll-option${nameAttr}
          class="mt-1 shrink-0 rounded border-pulse-violet/40 bg-space-void text-pulse-violet focus:ring-neural-glow"${checked}${disabled}>`
      : '';

    return `
      <label class="flex items-start gap-2 rounded-lg border border-pulse-violet/15 bg-space-void/40 px-3 py-2 text-sm ${isActive ? 'cursor-pointer hover:border-neural-glow/40' : ''}">
        ${input}
        <span class="min-w-0 flex-1">
          <span class="block text-starfield-white">${escapeHtml(opt.label)}</span>
          <span class="mt-1 flex items-center gap-2">
            <span class="h-1.5 min-w-[2rem] flex-1 overflow-hidden rounded-full bg-pulse-violet/15">
              <span class="block h-full rounded-full bg-pulse-violet/70" style="width:${Math.max(0, Math.min(100, opt.percent))}%"></span>
            </span>
            <span class="shrink-0 text-xs text-dim-text">${opt.percent}% · ${opt.voteCount}</span>
          </span>
        </span>
      </label>
    `;
  }).join('');

  const voteBtn = isActive
    ? `<button type="button" data-poll-vote="${escapeHtml(results.poll.pollId)}"
        class="rounded-lg border border-pulse-violet/35 px-3 py-1.5 text-xs text-neural-glow hover:border-neural-glow">
        ${escapeHtml(t('polls.vote'))}
      </button>`
    : '';

  const closeBtn = isActive && results.poll.canManage
    ? `<button type="button" data-poll-close="${escapeHtml(results.poll.pollId)}"
        class="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:border-red-400">
        ${escapeHtml(t('polls.close'))}
      </button>`
    : '';

  const votersBtn = canViewPollVoters()
    ? `<button type="button" data-poll-voters="${escapeHtml(results.poll.pollId)}"
        class="rounded-lg border border-pulse-violet/25 px-3 py-1.5 text-xs text-dim-text hover:text-neural-glow">
        ${escapeHtml(t('polls.viewVoters'))}
      </button>`
    : '';

  return `
    <div class="poll-widget rounded-lg border border-pulse-violet/20 bg-nebula-deep/40 p-3"
      data-poll-root="${escapeHtml(results.poll.pollId)}"
      data-poll-type="${results.poll.pollType}">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-medium uppercase tracking-wide text-neural-glow">${escapeHtml(t('polls.badge'))}</span>
        ${renderPollStatusBadge(results)}
      </div>
      <div class="space-y-2" data-poll-options>${optionsHtml}</div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="text-xs text-dim-text">${escapeHtml(t('polls.totalVoters', { count: results.totalVoters }))}</span>
        ${voteBtn}
        ${closeBtn}
        ${votersBtn}
      </div>
    </div>
  `;
}

/**
 * @param {string} pollId
 */
async function openVoterDetailsModal(pollId) {
  const details = await getPollVoterDetails(pollId);

  const votersHtml = details.voters.length
    ? `<ul class="max-h-48 space-y-2 overflow-y-auto text-sm">
        ${details.voters.map((row) => {
          const r = /** @type {Record<string, unknown>} */ (row);
          const labels = Array.isArray(r.optionLabels) ? r.optionLabels.join(', ') : '';
          return `<li class="rounded border border-pulse-violet/15 px-2 py-1.5">
            <span class="font-medium text-starfield-white">${escapeHtml(String(r.displayName ?? r.userId ?? ''))}</span>
            <span class="mt-0.5 block text-xs text-dim-text">${escapeHtml(labels)} · ${escapeHtml(formatPollTime(Number(r.votedAt)))}</span>
          </li>`;
        }).join('')}
      </ul>`
    : `<p class="text-sm text-dim-text">${escapeHtml(t('polls.noVoters'))}</p>`;

  const notVotedHtml = details.notVoted.length
    ? `<ul class="max-h-40 space-y-1 overflow-y-auto text-sm text-dim-text">
        ${details.notVoted.map((row) => {
          const r = /** @type {Record<string, unknown>} */ (row);
          return `<li>${escapeHtml(String(r.displayName ?? r.userId ?? ''))}</li>`;
        }).join('')}
      </ul>`
    : `<p class="text-sm text-dim-text">${escapeHtml(t('polls.everyoneVoted'))}</p>`;

  const historyHtml = details.history.length
    ? `<ul class="max-h-40 space-y-2 overflow-y-auto text-sm">
        ${details.history.map((row) => {
          const r = /** @type {Record<string, unknown>} */ (row);
          return `<li class="rounded border border-pulse-violet/10 px-2 py-1.5 text-xs text-dim-text">
            <span class="font-medium text-starfield-white">${escapeHtml(String(r.displayName ?? r.userId ?? ''))}</span>
            <span class="mt-0.5 block">${escapeHtml(t('polls.historyLine', {
              time: formatPollTime(Number(r.changedAt)),
            }))}</span>
          </li>`;
        }).join('')}
      </ul>`
    : `<p class="text-sm text-dim-text">${escapeHtml(t('polls.noHistory'))}</p>`;

  showModal({
    title: t('polls.voterDetailsTitle'),
    bodyHtml: `
      <div class="space-y-4 text-sm">
        <section>
          <h3 class="mb-2 font-medium text-neural-glow">${escapeHtml(t('polls.votedSection'))}</h3>
          ${votersHtml}
        </section>
        <section>
          <h3 class="mb-2 font-medium text-neural-glow">${escapeHtml(t('polls.notVotedSection'))}</h3>
          ${notVotedHtml}
        </section>
        <section>
          <h3 class="mb-2 font-medium text-neural-glow">${escapeHtml(t('polls.historySection'))}</h3>
          ${historyHtml}
        </section>
      </div>
    `,
    buttons: [{ label: t('actions.cancel'), onClick: closeModal }],
  });
}

/**
 * @param {HTMLElement} widget
 * @param {() => Promise<void>} onRefresh
 */
function bindPollWidget(widget, onRefresh) {
  widget.querySelector('[data-poll-vote]')?.addEventListener('click', async () => {
    const pollId = widget.getAttribute('data-poll-root');
    if (!pollId) {
      return;
    }

    const pollType = widget.getAttribute('data-poll-type');
    const selected = [...widget.querySelectorAll('[data-poll-option]:checked')]
      .map((el) => (el instanceof HTMLInputElement ? el.value : ''))
      .filter(Boolean);

    if (!selected.length) {
      showToast(t('polls.errorVoteRequired'), 'error');
      return;
    }

    if (pollType === 'single' && selected.length !== 1) {
      showToast(t('polls.errorSingleChoice'), 'error');
      return;
    }

    try {
      await castPollVote(pollId, selected);
      showToast(t('polls.voteSaved'), 'info');
      await onRefresh();
    } catch (error) {
      showToast(mapPollError(error instanceof Error ? error : new Error(String(error)), t), 'error');
    }
  });

  widget.querySelector('[data-poll-close]')?.addEventListener('click', async () => {
    const pollId = widget.getAttribute('data-poll-root');
    if (!pollId || !await confirmModal(t('polls.closeConfirm'))) {
      return;
    }
    try {
      await closeGroupPoll(pollId);
      showToast(t('polls.closedToast'), 'info');
      await onRefresh();
    } catch (error) {
      showToast(mapPollError(error instanceof Error ? error : new Error(String(error)), t), 'error');
    }
  });

  widget.querySelector('[data-poll-voters]')?.addEventListener('click', async () => {
    const pollId = widget.getAttribute('data-poll-root');
    if (!pollId) {
      return;
    }
    try {
      await openVoterDetailsModal(pollId);
    } catch (error) {
      showToast(mapPollError(error instanceof Error ? error : new Error(String(error)), t), 'error');
    }
  });
}

/**
 * @param {HTMLElement} container
 * @param {object[]} messages
 * @param {() => Promise<void>} onRefresh
 */
export async function mountGroupPollWidgets(container, messages, onRefresh) {
  container.querySelectorAll('.poll-widget').forEach((el) => el.remove());

  const messageIds = messages.map((m) => String(m.id ?? '')).filter(Boolean);
  if (!messageIds.length) {
    return;
  }

  let pollMetas = [];
  try {
    pollMetas = await getPollsForMessages(messageIds);
  } catch {
    return;
  }

  if (!pollMetas.length) {
    return;
  }

  await Promise.all(pollMetas.map(async (meta) => {
    const bubble = container.querySelector(`[data-msg-id="${CSS.escape(meta.groupMessageId)}"]`);
    if (!(bubble instanceof HTMLElement)) {
      return;
    }

    try {
      const results = await getPollResults(meta.pollId);
      const holder = document.createElement('div');
      holder.innerHTML = renderPollWidgetHtml(results);
      const widget = holder.firstElementChild;
      if (!(widget instanceof HTMLElement)) {
        return;
      }

      const reactionsBar = bubble.querySelector('.reactions-bar');
      if (reactionsBar) {
        reactionsBar.before(widget);
      } else {
        const timeEl = bubble.querySelector('p.text-right');
        if (timeEl) {
          timeEl.before(widget);
        } else {
          bubble.appendChild(widget);
        }
      }

      bindPollWidget(widget, onRefresh);
    } catch {
      /* poll RPC unavailable */
    }
  }));

  boundPollContainers.add(container);
}

/**
 * @param {() => Promise<void>} onCreated
 */
export function openCreatePollModal(onCreated) {
  showModal({
    title: t('polls.createTitle'),
    bodyHtml: `
      <div class="space-y-4 text-sm">
        <label class="block">
          <span class="mb-1 block text-dim-text">${escapeHtml(t('polls.questionLabel'))}</span>
          <input type="text" id="poll-create-question" maxlength="500"
            class="w-full rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2">
        </label>
        <fieldset>
          <legend class="mb-2 text-dim-text">${escapeHtml(t('polls.typeLabel'))}</legend>
          <label class="mr-4 inline-flex items-center gap-2">
            <input type="radio" name="poll-create-type" value="single" checked class="rounded">
            <span>${escapeHtml(t('polls.typeSingle'))}</span>
          </label>
          <label class="inline-flex items-center gap-2">
            <input type="radio" name="poll-create-type" value="multiple" class="rounded">
            <span>${escapeHtml(t('polls.typeMultiple'))}</span>
          </label>
        </fieldset>
        <div>
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-dim-text">${escapeHtml(t('polls.optionsLabel'))}</span>
            <button type="button" id="poll-add-option"
              class="text-xs text-synapse-blue hover:text-neural-glow">+ ${escapeHtml(t('polls.addOption'))}</button>
          </div>
          <div id="poll-options-list" class="space-y-2"></div>
        </div>
        <label class="block">
          <span class="mb-1 block text-dim-text">${escapeHtml(t('polls.closesAtLabel'))}</span>
          <input type="datetime-local" id="poll-create-closes"
            class="w-full rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2">
        </label>
        <p id="poll-create-error" class="hidden text-sm text-red-400"></p>
      </div>
    `,
    buttons: [
      { label: t('actions.cancel'), onClick: closeModal },
      {
        label: t('polls.createSubmit'),
        primary: true,
        onClick: async () => {
          const errorEl = document.getElementById('poll-create-error');
          const questionEl = document.getElementById('poll-create-question');
          const closesEl = document.getElementById('poll-create-closes');
          const typeEl = document.querySelector('input[name="poll-create-type"]:checked');

          const question = questionEl instanceof HTMLInputElement ? questionEl.value.trim() : '';
          const pollType = typeEl instanceof HTMLInputElement && typeEl.value === 'multiple' ? 'multiple' : 'single';
          const labels = [...document.querySelectorAll('#poll-options-list input')]
            .map((el) => (el instanceof HTMLInputElement ? el.value.trim() : ''))
            .filter(Boolean);

          let closesAt = null;
          if (closesEl instanceof HTMLInputElement && closesEl.value) {
            closesAt = new Date(closesEl.value).getTime();
            if (Number.isNaN(closesAt) || closesAt <= Date.now()) {
              if (errorEl) {
                errorEl.textContent = t('polls.errorClosesAt');
                errorEl.classList.remove('hidden');
              }
              return;
            }
          }

          try {
            await createGroupPoll({ question, pollType, optionLabels: labels, closesAt });
            closeModal();
            showToast(t('polls.createdToast'), 'info');
            await onCreated();
          } catch (error) {
            if (errorEl) {
              errorEl.textContent = mapPollError(error instanceof Error ? error : new Error(String(error)), t);
              errorEl.classList.remove('hidden');
            }
          }
        },
      },
    ],
  });

  const list = document.getElementById('poll-options-list');
  const addBtn = document.getElementById('poll-add-option');

  /**
   * @param {string} [value]
   */
  function addOptionRow(value = '') {
    if (!list) {
      return;
    }
    if (list.querySelectorAll('input').length >= MAX_POLL_OPTIONS) {
      return;
    }
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    row.innerHTML = `
      <input type="text" maxlength="200" value="${escapeHtml(value)}"
        class="min-w-0 flex-1 rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2"
        placeholder="${escapeHtml(t('polls.optionPlaceholder'))}">
      <button type="button" data-poll-remove-option
        class="shrink-0 text-xs text-red-400 hover:text-red-300" aria-label="${escapeHtml(t('polls.removeOption'))}">×</button>
    `;
    row.querySelector('[data-poll-remove-option]')?.addEventListener('click', () => {
      if (list.querySelectorAll('input').length > MIN_POLL_OPTIONS) {
        row.remove();
      }
    });
    list.appendChild(row);
  }

  addOptionRow();
  addOptionRow();
  addBtn?.addEventListener('click', () => addOptionRow());
}

export default {
  mountGroupPollWidgets,
  openCreatePollModal,
  renderPollWidgetHtml,
};
