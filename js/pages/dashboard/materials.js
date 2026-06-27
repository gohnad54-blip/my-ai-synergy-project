/** Materials list — dashboard table with visibility controls */

import { getSession, hasPermission, isAdmin } from '../../core/auth.js';
import db from '../../core/db.js';
import { getDateLocale, t } from '../../core/i18n.js';
import { getAllMaterials, softDeleteMaterial, updateMaterialVisibility } from '../../modules/materials.js';
import {
  getVisibilityDisplay,
  nextVisibilityPreset,
} from '../../modules/visibility.js';
import { confirmModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {number} ts
 */
function formatDate(ts) {
  if (!ts) {
    return '—';
  }
  return new Date(ts).toLocaleDateString(getDateLocale());
}

/**
 * @param {object} m
 * @param {boolean} canToggleVisibility
 */
function renderVisibilityCell(m, canToggleVisibility) {
  const { icon, label, mode } = getVisibilityDisplay(m);

  if (!canToggleVisibility) {
    return `<span title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon}</span>`;
  }

  return `
    <button type="button"
      class="vis-toggle rounded px-2 py-1 text-lg leading-none hover:bg-pulse-violet/20"
      data-id="${escapeHtml(m.id)}"
      data-mode="${mode}"
      title="${escapeHtml(label)} — клік для зміни"
      aria-label="Видимість: ${escapeHtml(label)}">
      ${icon}
    </button>
  `;
}

/**
 * @param {{ path: string, navigate: (path: string) => Promise<void> }} ctx
 */
export default async function init(ctx) {
  bindCreateMaterialLink(ctx);

  const session = getSession();
  const canToggleVisibility = hasPermission('content.visibility');
  const canDelete = hasPermission('content.delete.soft') || isAdmin();
  const isMine = window.location.search.includes('mine=1');
  const subtitle = document.getElementById('materials-subtitle');

  if (subtitle) {
    subtitle.textContent = isMine ? t('dashboard.myMaterials') : t('dashboard.allMaterials');
  }

  const [materials, categories] = await Promise.all([
    getAllMaterials(),
    db.getAll('categories'),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name ?? c.id]));
  let list = materials;

  if (isMine && session) {
    list = materials.filter((m) => m.authorId === session.userId);
  }

  const tbody = document.getElementById('materials-table-body');
  if (!tbody) {
    return;
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-dim-text">' + escapeHtml(t('dashboard.noMaterials')) + '</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((m) => {
    const statusBadge = m.status === 'published'
      ? '<span class="text-success">Опублікований</span>'
      : '<span class="text-warning">Чернетка</span>';

    return `
      <tr class="border-b border-pulse-violet/10 hover:bg-nebula-deep/30">
        <td class="px-4 py-3 font-medium">${escapeHtml(m.title || t('material.noTitle'))}</td>
        <td class="px-4 py-3">${statusBadge}</td>
        <td class="px-4 py-3 text-dim-text">${escapeHtml(m.categoryId ? (catMap.get(m.categoryId) ?? '—') : '—')}</td>
        <td class="px-4 py-3 text-dim-text">${formatDate(m.updatedAt)}</td>
        <td class="px-4 py-3">${renderVisibilityCell(m, canToggleVisibility)}</td>
        <td class="px-4 py-3">
          <div class="flex flex-wrap gap-3">
            <a href="/dashboard/material-edit/${m.id}" data-spa-nav="/dashboard/material-edit/${m.id}" class="text-neural-glow hover:underline">${escapeHtml(t('actions.edit'))}</a>
            ${canDelete ? `<button type="button" class="material-delete text-danger hover:underline" data-id="${escapeHtml(m.id)}" data-title="${escapeHtml(m.title || t('material.noTitle'))}">${escapeHtml(t('actions.delete'))}</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (canToggleVisibility) {
    bindVisibilityToggles(tbody);
  }

  if (canDelete) {
    bindDeleteButtons(tbody, ctx);
  }
}

/**
 * @param {HTMLElement} tbody
 */
function bindVisibilityToggles(tbody) {
  tbody.querySelectorAll('.vis-toggle').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const id = button.dataset.id;
      const mode = button.dataset.mode;

      if (!id || !mode) {
        return;
      }

      const preset = nextVisibilityPreset(/** @type {'guest' | 'authenticated' | 'restricted'} */ (mode));

      button.disabled = true;

      try {
        await updateMaterialVisibility(id, preset);
        const display = getVisibilityDisplay({ visibility: preset });
        button.textContent = display.icon;
        button.dataset.mode = display.mode;
        button.title = `${display.label} — клік для зміни`;
        button.setAttribute('aria-label', `Видимість: ${display.label}`);
        showToast(`Видимість: ${display.label}`, 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не вдалося змінити видимість';
        showToast(message, 'error');
      } finally {
        button.disabled = false;
      }
    });
  });
}

/**
 * @param {HTMLElement} tbody
 * @param {{ navigate: (path: string) => Promise<void> }} ctx
 */
function bindDeleteButtons(tbody, ctx) {
  tbody.querySelectorAll('.material-delete').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const id = button.dataset.id;
      const title = button.dataset.title ?? '';
      if (!id) {
        return;
      }

      const confirmed = await confirmModal(t('trash.confirmMoveToTrash', { title }));
      if (!confirmed) {
        return;
      }

      button.disabled = true;
      try {
        await softDeleteMaterial(id);
        showToast(t('trash.movedToTrash'), 'success');
        await ctx.navigate(window.location.pathname + window.location.search);
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('errors.general'), 'error');
        button.disabled = false;
      }
    });
  });
}

/**
 * @param {{ navigate: (path: string) => Promise<void> }} ctx
 */
function bindCreateMaterialLink(ctx) {
  const link = document.querySelector('[data-spa-nav="/dashboard/material-edit"]')
    ?? document.querySelector('a[href="/dashboard/material-edit"]');

  if (!link) {
    console.warn('[materials] create link not found in DOM');
    return;
  }

  link.addEventListener('click', (event) => {
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    ctx.navigate('/dashboard/material-edit');
  });
  link.dataset.spaBound = 'true';
}
