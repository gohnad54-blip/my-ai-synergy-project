/** Categories management — guest access toggles */

import {
  createCategory,
  getAllCategories,
  setCategoryGuestAccess,
} from '../../modules/categories.js';
import { syncCategoryPublicMaterials } from '../../modules/materials.js';
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
 * @param {object[]} categories
 */
function renderCategories(categories) {
  const list = document.getElementById('categories-list');
  if (!list) {
    return;
  }

  if (categories.length === 0) {
    list.innerHTML = '<p class="text-dim-text">Категорій ще немає. Створіть першу категорію.</p>';
    return;
  }

  list.innerHTML = categories.map((category) => `
    <article class="rounded-xl border border-pulse-violet/25 bg-nebula-deep/30 p-5">
      <h2 class="font-medium text-starfield-white">${escapeHtml(category.name)}</h2>
      <label class="mt-4 flex cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox"
          class="cat-guest-toggle rounded border-pulse-violet/40"
          data-id="${escapeHtml(category.id)}"
          ${category.guestAccess ? 'checked' : ''}>
        <span>
          <span class="text-starfield-white">Відкрити категорію для гостей</span>
          <span class="mt-0.5 block text-xs text-dim-text">Матеріали успадковують доступ, якщо не обмежено вручну</span>
        </span>
      </label>
    </article>
  `).join('');

  list.querySelectorAll('.cat-guest-toggle').forEach((input) => {
    input.addEventListener('change', async () => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      const id = input.dataset.id;
      if (!id) {
        return;
      }

      input.disabled = true;

      try {
        await setCategoryGuestAccess(id, input.checked);
        await syncCategoryPublicMaterials(id);
        showToast(
          input.checked ? 'Категорію відкрито для гостей' : 'Guest-доступ категорії вимкнено',
          'success',
        );
      } catch (error) {
        input.checked = !input.checked;
        const message = error instanceof Error ? error.message : 'Не вдалося оновити категорію';
        showToast(message, 'error');
      } finally {
        input.disabled = false;
      }
    });
  });
}

export default async function init() {
  const addBtn = document.getElementById('btn-add-category');
  const errorEl = document.getElementById('categories-error');

  addBtn?.addEventListener('click', async () => {
    const name = window.prompt('Назва нової категорії');
    if (!name?.trim()) {
      return;
    }

    if (errorEl) {
      errorEl.classList.add('hidden');
    }

    try {
      await createCategory({ name: name.trim() });
      showToast('Категорію створено', 'success');
      renderCategories(await getAllCategories());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося створити категорію';
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
      } else {
        showToast(message, 'error');
      }
    }
  });

  renderCategories(await getAllCategories());
}
