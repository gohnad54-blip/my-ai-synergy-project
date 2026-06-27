/** Access requests dashboard */

import { getDateLocale, t } from '../../core/i18n.js';
import { hasPermission } from '../../core/auth.js';
import {
  approveRequest,
  getAllRequests,
  rejectRequest,
  syncFromNetlify,
} from '../../modules/requests.js';
import { showToast } from '../../ui/toast.js';

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} status
 * @returns {string}
 */
function statusLabel(status) {
  if (status === 'approved') {
    return t('requests.statusApproved');
  }
  if (status === 'rejected') {
    return t('requests.statusRejected');
  }
  return t('requests.statusNew');
}

/**
 * @param {string} status
 * @returns {string}
 */
function statusBadgeClass(status) {
  if (status === 'approved') {
    return 'bg-success/20 text-success';
  }
  if (status === 'rejected') {
    return 'bg-danger/20 text-danger';
  }
  return 'bg-synapse-blue/20 text-synapse-blue';
}

/**
 * @param {number} ts
 * @returns {string}
 */
function formatDate(ts) {
  if (!ts) {
    return '—';
  }
  return new Date(ts).toLocaleDateString(getDateLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * @param {object[]} items
 */
function renderRequests(items) {
  const container = document.getElementById('requests-list');
  if (!container) {
    return;
  }

  const canProcess = hasPermission('requests.process');

  if (items.length === 0) {
    container.innerHTML = `<p class="text-sm text-dim-text">${escapeHtml(t('requests.empty'))}</p>`;
    return;
  }

  container.innerHTML = items.map((req) => {
    const pending = req.status === 'pending' || req.status === 'new';
    const actions = pending && canProcess
      ? `
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="request-approve rounded-lg border border-success/40 px-3 py-1.5 text-sm text-success hover:bg-success/10" data-id="${escapeHtml(req.id)}">${escapeHtml(t('requests.approve'))}</button>
          <button type="button" class="request-reject rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger/10" data-id="${escapeHtml(req.id)}">${escapeHtml(t('requests.reject'))}</button>
          <a href="/dashboard/user-create" data-spa-nav="/dashboard/user-create" class="rounded-lg border border-pulse-violet/30 px-3 py-1.5 text-sm text-neural-glow hover:border-neural-glow">${escapeHtml(t('requests.createAccount'))}</a>
        </div>
      `
      : '';

    return `
      <article class="rounded-xl border border-pulse-violet/25 bg-nebula-deep/50 p-4" data-request-id="${escapeHtml(req.id)}">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded px-2 py-0.5 text-xs ${statusBadgeClass(req.status)}">${escapeHtml(statusLabel(req.status))}</span>
          <span class="font-medium text-starfield-white">${escapeHtml(req.name ?? t('requests.unnamed'))}</span>
          ${req.email ? `<span class="text-sm text-dim-text">${escapeHtml(req.email)}</span>` : ''}
          <span class="text-xs text-dim-text">${formatDate(req.createdAt)}</span>
        </div>
        ${req.telegram ? `<p class="mt-2 text-sm text-dim-text">Telegram: ${escapeHtml(req.telegram)}</p>` : ''}
        ${req.reason ? `<p class="mt-2 text-sm leading-relaxed text-dim-text">${escapeHtml(req.reason)}</p>` : ''}
        ${actions}
      </article>
    `;
  }).join('');
}

async function loadRequests() {
  const items = await getAllRequests();
  renderRequests(items);
}

function bindEvents() {
  document.getElementById('requests-sync-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('requests-sync-btn');
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
    }

    try {
      const count = await syncFromNetlify();
      showToast(t('requests.synced', { count }), 'success');
      await loadRequests();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('errors.general'), 'error');
    } finally {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
      }
    }
  });

  document.getElementById('requests-list')?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const approveBtn = target.closest('.request-approve');
    if (approveBtn instanceof HTMLButtonElement && approveBtn.dataset.id) {
      approveBtn.disabled = true;
      try {
        await approveRequest(approveBtn.dataset.id);
        showToast(t('requests.approved'), 'success');
        await loadRequests();
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('errors.general'), 'error');
        approveBtn.disabled = false;
      }
      return;
    }

    const rejectBtn = target.closest('.request-reject');
    if (rejectBtn instanceof HTMLButtonElement && rejectBtn.dataset.id) {
      rejectBtn.disabled = true;
      try {
        await rejectRequest(rejectBtn.dataset.id);
        showToast(t('requests.rejected'), 'success');
        await loadRequests();
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('errors.general'), 'error');
        rejectBtn.disabled = false;
      }
    }
  });
}

export default async function init() {
  bindEvents();
  await loadRequests();
}
