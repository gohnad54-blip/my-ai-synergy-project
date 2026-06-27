/** Users list — table, edit, password, deactivate */

import { isAdmin, getSession } from '../../core/auth.js';
import { getAllRoles, getRoleLabel } from '../../modules/roles.js';
import {
  activateUser,
  changePassword,
  deactivateUser,
  getAllUsers,
  updateUser,
} from '../../modules/users.js';
import { closeModal, confirmModal, showModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';

/**
 * @param {number} ts
 * @returns {string}
 */
function formatDate(ts) {
  if (!ts) {
    return '—';
  }
  return new Date(ts).toLocaleDateString('uk-UA');
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object[]} users
 * @param {Map<string, object>} roleMap
 */
function renderTable(users, roleMap) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) {
    return;
  }

  const canEdit = isAdmin();
  const canPassword = isAdmin();
  const canDeactivate = isAdmin();
  const session = getSession();

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-dim-text">Немає користувачів</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((user) => {
    const statusClass = user.status === 'inactive'
      ? 'text-dim-text'
      : 'text-success';
    const statusLabel = user.status === 'inactive' ? 'Неактивний' : 'Активний';
    const isSelf = session?.userId === user.id;

    const actions = [];
    if (canEdit) {
      actions.push(`<button type="button" data-action="edit" data-id="${user.id}" class="text-neural-glow hover:underline">Редагувати</button>`);
    }
    if (canPassword && user.role !== 'admin') {
      actions.push(`<button type="button" data-action="password" data-id="${user.id}" class="text-synapse-blue hover:underline">Змінити пароль</button>`);
    }
    if (canDeactivate && !isSelf) {
      if (user.status === 'inactive') {
        actions.push(`<button type="button" data-action="activate" data-id="${user.id}" class="text-success hover:underline">Активувати</button>`);
      } else {
        actions.push(`<button type="button" data-action="deactivate" data-id="${user.id}" class="text-red-400 hover:underline">Деактивувати</button>`);
      }
    }

    return `
      <tr class="border-b border-pulse-violet/10 hover:bg-nebula-deep/30">
        <td class="px-4 py-3 font-medium">${escapeHtml(user.displayName ?? user.login)}</td>
        <td class="px-4 py-3 mono text-dim-text">${escapeHtml(user.login)}</td>
        <td class="px-4 py-3">${escapeHtml(getRoleLabel(user.role, roleMap))}</td>
        <td class="px-4 py-3 ${statusClass}">${statusLabel}</td>
        <td class="px-4 py-3 text-dim-text">${formatDate(user.createdAt)}</td>
        <td class="px-4 py-3">
          <div class="flex flex-wrap gap-2 text-xs">${actions.join('') || '—'}</div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(
      /** @type {string} */ (btn.getAttribute('data-action')),
      /** @type {string} */ (btn.getAttribute('data-id')),
      users,
      roleMap,
    ));
  });
}

/**
 * @param {string} action
 * @param {string} userId
 * @param {object[]} users
 * @param {Map<string, object>} roleMap
 */
async function handleAction(action, userId, users, roleMap) {
  const user = users.find((u) => u.id === userId);
  if (!user) {
    return;
  }

  switch (action) {
    case 'edit':
      openEditModal(user, roleMap, users);
      break;
    case 'password':
      openPasswordModal(user);
      break;
    case 'deactivate': {
      const ok = await confirmModal(`Деактивувати акаунт «${user.login}»?`);
      if (!ok) {
        return;
      }
      try {
        await deactivateUser(userId);
        showToast('Користувача деактивовано');
        await refresh();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Помилка', 'error');
      }
      break;
    }
    case 'activate':
      try {
        await activateUser(userId);
        showToast('Користувача активовано');
        await refresh();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Помилка', 'error');
      }
      break;
    default:
      break;
  }
}

/**
 * @param {object} user
 * @param {Map<string, object>} roleMap
 * @param {object[]} users
 */
function openEditModal(user, roleMap, users) {
  const roles = [...roleMap.values()];
  const roleOptions = user.role === 'admin'
    ? '<option value="admin" selected>Адміністратор</option>'
    : roles.map((r) => `<option value="${r.id}" ${user.role === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

  showModal({
    title: 'Редагувати користувача',
    bodyHtml: `
      <form id="edit-user-form" class="space-y-4">
        <div>
          <label class="mb-1 block text-sm text-dim-text">Логін</label>
          <input type="text" value="${escapeHtml(user.login)}" disabled
            class="w-full rounded-lg border border-pulse-violet/20 bg-space-void/50 px-3 py-2 text-dim-text">
        </div>
        <div>
          <label class="mb-1 block text-sm text-dim-text">Ім'я для відображення</label>
          <input id="edit-display" type="text" value="${escapeHtml(user.displayName ?? '')}" required
            class="w-full rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2">
        </div>
        ${user.role !== 'admin' ? `
        <div>
          <label class="mb-1 block text-sm text-dim-text">Роль</label>
          <select id="edit-role" class="w-full rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2">${roleOptions}</select>
        </div>` : ''}
        <div>
          <label class="mb-1 block text-sm text-dim-text">Нотатка</label>
          <textarea id="edit-note" rows="2" class="w-full rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2">${escapeHtml(user.adminNote ?? '')}</textarea>
        </div>
      </form>
    `,
    buttons: [
      { label: 'Скасувати', onClick: closeModal },
      {
        label: 'Зберегти',
        primary: true,
        onClick: async () => {
          try {
            await updateUser(user.id, {
              displayName: /** @type {HTMLInputElement} */ (document.getElementById('edit-display')).value,
              role: user.role === 'admin' ? 'admin' : /** @type {HTMLSelectElement} */ (document.getElementById('edit-role'))?.value,
              adminNote: /** @type {HTMLTextAreaElement} */ (document.getElementById('edit-note')).value,
            });
            closeModal();
            showToast('Збережено');
            await refresh();
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Помилка', 'error');
          }
        },
      },
    ],
  });
}

/**
 * @param {object} user
 */
function openPasswordModal(user) {
  showModal({
    title: 'Змінити пароль',
    bodyHtml: `
      <p class="mb-4 text-sm text-dim-text">Новий пароль для <strong>${escapeHtml(user.login)}</strong></p>
      <input id="new-password" type="password" minlength="8" placeholder="Мінімум 8 символів"
        class="w-full rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2">
      <input id="new-password-confirm" type="password" minlength="8" placeholder="Підтвердіть пароль"
        class="mt-3 w-full rounded-lg border border-pulse-violet/30 bg-space-void px-3 py-2">
    `,
    buttons: [
      { label: 'Скасувати', onClick: closeModal },
      {
        label: 'Зберегти',
        primary: true,
        onClick: async () => {
          const pw = /** @type {HTMLInputElement} */ (document.getElementById('new-password')).value;
          const confirm = /** @type {HTMLInputElement} */ (document.getElementById('new-password-confirm')).value;
          if (pw.length < 8) {
            showToast('Пароль занадто короткий', 'error');
            return;
          }
          if (pw !== confirm) {
            showToast('Паролі не співпадають', 'error');
            return;
          }
          try {
            await changePassword(user.id, pw);
            closeModal();
            showToast('Пароль змінено');
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Помилка', 'error');
          }
        },
      },
    ],
  });
}

async function refresh() {
  const [users, roles] = await Promise.all([getAllUsers(), getAllRoles()]);
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  renderTable(users, roleMap);
}

export default async function init() {
  if (isAdmin()) {
    document.getElementById('users-create-link')?.classList.remove('hidden');
  }

  await refresh();
}
