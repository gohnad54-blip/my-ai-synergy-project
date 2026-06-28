/** Dashboard — moderation of all material comments */

import { t } from '../../core/i18n.js';
import { getSession } from '../../core/auth.js';
import { escapeHtml } from '../../core/security.js';
import { getAllMaterials } from '../../modules/materials.js';
import {
  MAX_COMMENT_LENGTH,
  addComment,
  deleteComment,
  getAllComments,
} from '../../modules/comments.js';
import { formatPublicDate } from '../../ui/public.js';
import { closeModal, confirmModal, showModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';

/** @type {Map<string, object>} */
let materialMap = new Map();

/** @type {object[]} */
let commentableMaterials = [];

/**
 * @param {string} materialId
 * @returns {string}
 */
function materialTitle(materialId) {
  const material = materialMap.get(materialId);
  return material?.title?.trim() || materialId || '—';
}

/**
 * @param {object} comment
 * @returns {string}
 */
function renderCommentRow(comment) {
  const materialHref = `/materials/${encodeURIComponent(comment.materialId)}`;
  return `
    <article class="rounded-xl border border-pulse-violet/20 bg-nebula-deep/40 p-4" data-comment-id="${escapeHtml(comment.id)}">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1 space-y-2">
          <p class="whitespace-pre-wrap break-words text-sm text-starfield-white">${escapeHtml(comment.body ?? '')}</p>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim-text">
            <span>${t('dashComments.author')}: <span class="text-starfield-white">${escapeHtml(comment.authorName ?? '—')}</span></span>
            <span>${t('dashComments.date')}: ${formatPublicDate(comment.createdAt)}</span>
          </div>
          <p class="text-xs text-dim-text">
            ${t('dashComments.material')}:
            <a href="${escapeHtml(materialHref)}" data-spa-nav="${escapeHtml(materialHref)}"
              class="text-synapse-blue hover:text-neural-glow">${escapeHtml(materialTitle(comment.materialId))}</a>
          </p>
        </div>
        <button type="button" data-delete-comment="${escapeHtml(comment.id)}"
          class="shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:border-red-400">
          ${t('comments.delete')}
        </button>
      </div>
    </article>
  `;
}

/**
 * @param {object[]} comments
 */
function renderList(comments) {
  const container = document.getElementById('comments-admin-list');
  if (!container) {
    return;
  }

  if (comments.length === 0) {
    container.innerHTML = `<p class="text-sm text-dim-text">${escapeHtml(t('dashComments.empty'))}</p>`;
    return;
  }

  container.innerHTML = comments.map(renderCommentRow).join('');
  bindDeleteButtons(container);
}

function bindDeleteButtons(container) {
  container.querySelectorAll('[data-delete-comment]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-comment');
      if (!id || !await confirmModal(t('comments.deleteConfirm'))) {
        return;
      }
      try {
        await deleteComment(id);
        container.querySelector(`[data-comment-id="${id}"]`)?.remove();
        if (!container.querySelector('[data-comment-id]')) {
          container.innerHTML = `<p class="text-sm text-dim-text">${escapeHtml(t('dashComments.empty'))}</p>`;
        }
        showToast(t('comments.deleted'), 'info');
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('comments.deleteError'), 'error');
      }
    });
  });
}

async function populateMaterialFilter(allComments) {
  const select = document.getElementById('comments-filter-material');
  if (!(select instanceof HTMLSelectElement)) {
    return;
  }

  const materials = await getAllMaterials();
  materialMap = new Map(materials.map((m) => [m.id, m]));
  commentableMaterials = materials
    .filter((m) => m.status === 'published' && !m.deletedAt && (m.commentsAccess ?? 'disabled') !== 'disabled')
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'uk'));

  const commentMaterialIds = new Set(allComments.map((c) => c.materialId));
  const filterMaterials = materials
    .filter((m) => commentMaterialIds.has(m.id))
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'uk'));

  select.innerHTML = [
    `<option value="">${escapeHtml(t('dashComments.filterAll'))}</option>`,
    ...filterMaterials.map((m) => (
      `<option value="${escapeHtml(m.id)}">${escapeHtml(m.title || m.id)}</option>`
    )),
  ].join('');
}

async function refresh() {
  const select = document.getElementById('comments-filter-material');
  const materialId = select instanceof HTMLSelectElement ? select.value : '';
  const comments = await getAllComments(materialId || undefined);
  renderList(comments);
}

function openWriteModal() {
  const session = getSession();
  const options = commentableMaterials.map((m) => (
    `<option value="${escapeHtml(m.id)}">${escapeHtml(m.title || m.id)}</option>`
  )).join('');

  showModal({
    title: t('dashComments.writeTitle'),
    bodyHtml: `
      <p class="mb-4 text-sm text-dim-text">${escapeHtml(t('dashComments.writeAs', { name: session?.displayName ?? session?.login ?? '—' }))}</p>
      <label class="mb-4 block text-sm">
        <span class="mb-1 block text-dim-text">${escapeHtml(t('dashComments.selectMaterial'))}</span>
        <select id="modal-comment-material"
          class="w-full rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2 text-sm">
          <option value="">${escapeHtml(t('dashComments.selectMaterialPlaceholder'))}</option>
          ${options}
        </select>
      </label>
      <label class="block text-sm">
        <span class="mb-1 block text-dim-text">${escapeHtml(t('comments.placeholder'))}</span>
        <textarea id="modal-comment-body" rows="4" maxlength="${MAX_COMMENT_LENGTH}"
          class="w-full rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2 text-sm"></textarea>
      </label>
      <p id="modal-comment-error" class="mt-2 hidden text-sm text-red-400"></p>
    `,
    buttons: [
      { label: t('actions.cancel'), onClick: closeModal },
      {
        label: t('comments.submit'),
        primary: true,
        onClick: async () => {
          const materialEl = document.getElementById('modal-comment-material');
          const bodyEl = document.getElementById('modal-comment-body');
          const errorEl = document.getElementById('modal-comment-error');
          const materialId = materialEl instanceof HTMLSelectElement ? materialEl.value : '';
          const body = bodyEl instanceof HTMLTextAreaElement ? bodyEl.value : '';

          if (errorEl) {
            errorEl.classList.add('hidden');
            errorEl.textContent = '';
          }

          if (!materialId) {
            if (errorEl) {
              errorEl.textContent = t('dashComments.selectMaterialRequired');
              errorEl.classList.remove('hidden');
            }
            return;
          }

          try {
            await addComment(materialId, body);
            closeModal();
            showToast(t('dashComments.posted'), 'success');
            const allComments = await getAllComments();
            populateMaterialFilter(allComments);
            const filterVal = document.getElementById('comments-filter-material');
            const selected = filterVal instanceof HTMLSelectElement ? filterVal.value : '';
            const filtered = selected
              ? allComments.filter((c) => c.materialId === selected)
              : allComments;
            renderList(filtered);
          } catch (error) {
            const code = error instanceof Error ? error.message : '';
            const message = code.startsWith('addComment:')
              ? code.replace(/^addComment:\s*/, '')
              : code === 'COMMENT_EMPTY'
                ? t('comments.emptyBody')
                : code === 'COMMENT_TOO_LONG'
                  ? t('comments.tooLong')
                  : (error instanceof Error ? error.message : t('comments.submitError'));
            if (errorEl) {
              errorEl.textContent = message;
              errorEl.classList.remove('hidden');
            }
          }
        },
      },
    ],
  });
}

function bindEvents() {
  document.getElementById('comments-filter-material')?.addEventListener('change', () => {
    void refresh();
  });

  document.getElementById('comments-write-btn')?.addEventListener('click', () => {
    if (commentableMaterials.length === 0) {
      showToast(t('dashComments.noCommentableMaterials'), 'error');
      return;
    }
    openWriteModal();
  });
}

export default async function init() {
  bindEvents();
  const allComments = await getAllComments();
  await populateMaterialFilter(allComments);
  renderList(allComments);
}
