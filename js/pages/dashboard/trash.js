/** Trash page — restore and hard delete */

import { isAdmin } from '../../core/auth.js';
import { getDateLocale, t } from '../../core/i18n.js';
import db from '../../core/db.js';
import {
  emptyTrash,
  getDeletedMaterials,
  hardDeleteMaterial,
  restoreMaterial,
} from '../../modules/materials.js';
import { confirmModal } from '../../ui/modal.js';
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
 * @param {string} userId
 * @param {Map<string, string>} cache
 * @returns {Promise<string>}
 */
async function resolveUserName(userId, cache) {
  if (!userId) {
    return '—';
  }
  if (cache.has(userId)) {
    return cache.get(userId) ?? '—';
  }
  const user = await db.get('users', userId);
  const name = user?.displayName ?? user?.login ?? t('common.user');
  cache.set(userId, name);
  return name;
}

/**
 * @param {object[]} items
 */
async function renderTrashList(items) {
  const container = document.getElementById('trash-list');
  const emptyBtn = document.getElementById('trash-empty-btn');
  if (!container) {
    return;
  }

  if (emptyBtn) {
    emptyBtn.classList.toggle('hidden', items.length === 0 || !isAdmin());
  }

  if (items.length === 0) {
    container.innerHTML = `<p class="text-sm text-dim-text">${escapeHtml(t('trash.empty'))}</p>`;
    return;
  }

  const cache = new Map();
  const rows = await Promise.all(items.map(async (material) => {
    const deletedBy = await resolveUserName(material.deletedBy, cache);
    const title = material.title || t('material.noTitle');
    const hardDeleteBtn = isAdmin()
      ? `<button type="button" class="trash-hard-delete rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger/10" data-id="${escapeHtml(material.id)}" data-title="${escapeHtml(title)}" data-i18n="trash.hardDelete">${escapeHtml(t('trash.hardDelete'))}</button>`
      : '';

    return `
      <div class="rounded-xl border border-pulse-violet/25 bg-nebula-deep/50 p-4" data-trash-id="${escapeHtml(material.id)}">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 class="font-medium text-starfield-white">${escapeHtml(title)}</h2>
            <p class="mt-2 text-sm text-dim-text">
              ${escapeHtml(t('trash.deletedBy'))} ${escapeHtml(deletedBy)}
              · ${escapeHtml(t('trash.deletedAt'))} ${formatDate(material.deletedAt)}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="trash-restore rounded-lg border border-success/40 px-3 py-1.5 text-sm text-success hover:bg-success/10" data-id="${escapeHtml(material.id)}">${escapeHtml(t('actions.restore'))}</button>
            ${hardDeleteBtn}
          </div>
        </div>
      </div>
    `;
  }));

  container.innerHTML = rows.join('');
}

async function loadTrash() {
  const items = await getDeletedMaterials();
  await renderTrashList(items);
}

function bindEvents() {
  document.getElementById('trash-list')?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const restoreBtn = target.closest('.trash-restore');
    if (restoreBtn instanceof HTMLButtonElement && restoreBtn.dataset.id) {
      restoreBtn.disabled = true;
      try {
        await restoreMaterial(restoreBtn.dataset.id);
        showToast(t('trash.restored'), 'success');
        await loadTrash();
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('errors.general'), 'error');
        restoreBtn.disabled = false;
      }
      return;
    }

    const hardBtn = target.closest('.trash-hard-delete');
    if (hardBtn instanceof HTMLButtonElement && hardBtn.dataset.id) {
      const title = hardBtn.dataset.title ?? '';
      const confirmed = await confirmModal(t('trash.confirmHardDelete', { title }));
      if (!confirmed) {
        return;
      }

      hardBtn.disabled = true;
      try {
        await hardDeleteMaterial(hardBtn.dataset.id);
        showToast(t('trash.hardDeleted'), 'success');
        await loadTrash();
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('errors.general'), 'error');
        hardBtn.disabled = false;
      }
    }
  });

  document.getElementById('trash-empty-btn')?.addEventListener('click', async () => {
    const confirmed = await confirmModal(t('trash.confirmEmpty'));
    if (!confirmed) {
      return;
    }

    try {
      const count = await emptyTrash();
      showToast(t('trash.emptied', { count }), 'success');
      await loadTrash();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('errors.general'), 'error');
    }
  });
}

export default async function init() {
  bindEvents();
  await loadTrash();
}
