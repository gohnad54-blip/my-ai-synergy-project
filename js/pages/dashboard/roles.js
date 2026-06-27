/** Roles management — admin UI */

import {
  PERMISSION_GROUPS,
  createRole,
  deleteRole,
  getAllRoles,
  updateRole,
} from '../../modules/roles.js';
import { confirmModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';

/** @type {string | null} */
let selectedRoleId = null;
/** @type {boolean} */
let isNewRole = false;

/** @param {string} msg */
function showRoleError(msg) {
  const el = document.getElementById('role-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function hideRoleError() {
  document.getElementById('role-error')?.classList.add('hidden');
}

function renderPermissionsGrid() {
  const grid = document.getElementById('permissions-grid');
  if (!grid) {
    return;
  }

  grid.innerHTML = PERMISSION_GROUPS.map((group) => `
    <div>
      <h3 class="mb-3 text-xs font-semibold tracking-wider text-dim-text">${group.label}</h3>
      <div class="space-y-2">
        ${group.permissions.map((perm) => {
          const disabled = perm.adminOnly;
          const title = disabled ? 'title="Лише адмін"' : '';
          const disabledClass = disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer';
          return `
            <label class="flex items-start gap-3 text-sm ${disabledClass}" ${title}>
              <input type="checkbox" name="permission" value="${perm.id}"
                ${disabled ? 'disabled' : ''}
                class="mt-0.5 rounded border-pulse-violet/40 bg-space-void text-pulse-violet focus:ring-neural-glow">
              <span>${perm.label}${disabled ? ' <span class="text-xs text-dim-text">(лише адмін)</span>' : ''}</span>
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

/**
 * @param {object[]} roles
 */
function renderRolesList(roles) {
  const list = document.getElementById('roles-list');
  if (!list) {
    return;
  }

  if (roles.length === 0) {
    list.innerHTML = '<li class="px-2 py-2 text-sm text-dim-text">Ще немає ролей</li>';
    return;
  }

  list.innerHTML = roles.map((role) => {
    const active = selectedRoleId === role.id;
    return `
      <li>
        <button type="button" data-role-id="${role.id}"
          class="w-full rounded-lg px-3 py-2 text-left text-sm transition ${active ? 'bg-pulse-violet/25 text-neural-glow' : 'text-dim-text hover:bg-nebula-deep hover:text-starfield-white'}">
          ${escapeHtml(role.name)}
        </button>
      </li>
    `;
  }).join('');

  list.querySelectorAll('[data-role-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectRole(/** @type {string} */ (btn.getAttribute('data-role-id')));
    });
  });
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {object} role
 */
function fillForm(role) {
  const form = document.getElementById('role-form');
  const empty = document.getElementById('role-editor-empty');
  const deleteBtn = document.getElementById('role-delete-btn');
  const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('role-name'));

  form?.classList.remove('hidden');
  empty?.classList.add('hidden');
  deleteBtn?.classList.toggle('hidden', isNewRole);

  if (nameInput) {
    nameInput.value = role.name ?? '';
  }

  document.querySelectorAll('input[name="permission"]:not([disabled])').forEach((input) => {
    const el = /** @type {HTMLInputElement} */ (input);
    el.checked = (role.permissions ?? []).includes(el.value);
  });
}

function startNewRole() {
  isNewRole = true;
  selectedRoleId = null;
  fillForm({ name: '', permissions: [] });
  document.getElementById('role-name')?.focus();
  refreshListHighlight();
}

/**
 * @param {string} roleId
 */
async function selectRole(roleId) {
  isNewRole = false;
  selectedRoleId = roleId;

  const roles = await getAllRoles();
  const role = roles.find((r) => r.id === roleId);
  if (role) {
    fillForm(role);
  }

  renderRolesList(roles);
}

async function refreshListHighlight() {
  const roles = await getAllRoles();
  renderRolesList(roles);
}

/**
 * @returns {string[]}
 */
function getSelectedPermissions() {
  return [...document.querySelectorAll('input[name="permission"]:checked:not([disabled])')]
    .map((el) => /** @type {HTMLInputElement} */ (el).value);
}

export default async function init() {
  renderPermissionsGrid();

  const roles = await getAllRoles();
  renderRolesList(roles);

  document.getElementById('role-create-btn')?.addEventListener('click', () => {
    hideRoleError();
    startNewRole();
    refreshListHighlight();
  });

  document.getElementById('role-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideRoleError();

    const name = /** @type {HTMLInputElement} */ (document.getElementById('role-name')).value.trim();
    if (!name) {
      showRoleError('Введіть назву ролі');
      return;
    }

    const permissions = getSelectedPermissions();
    const saveBtn = document.getElementById('role-save-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
    }

    try {
      if (isNewRole) {
        const role = await createRole({ name, permissions });
        isNewRole = false;
        selectedRoleId = role.id;
        showToast('Роль створено');
      } else if (selectedRoleId) {
        await updateRole(selectedRoleId, { name, permissions });
        showToast('Роль збережено');
      }

      await refreshListHighlight();
      if (selectedRoleId) {
        await selectRole(selectedRoleId);
      }
    } catch (error) {
      showRoleError(error instanceof Error ? error.message : 'Помилка збереження');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
      }
    }
  });

  document.getElementById('role-delete-btn')?.addEventListener('click', async () => {
    if (!selectedRoleId) {
      return;
    }

    const ok = await confirmModal('Видалити цю роль? Дію не можна скасувати.');
    if (!ok) {
      return;
    }

    try {
      await deleteRole(selectedRoleId);
      showToast('Роль видалено');
      selectedRoleId = null;
      isNewRole = false;
      document.getElementById('role-form')?.classList.add('hidden');
      document.getElementById('role-editor-empty')?.classList.remove('hidden');
      await refreshListHighlight();
    } catch (error) {
      showRoleError(error instanceof Error ? error.message : 'Помилка видалення');
    }
  });
}
