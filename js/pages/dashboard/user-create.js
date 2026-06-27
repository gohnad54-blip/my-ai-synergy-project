/** User create — account constructor */

import { getAllRoles } from '../../modules/roles.js';
import { createUser } from '../../modules/users.js';
import { showToast } from '../../ui/toast.js';

/** @type {string | null} */
let createdPassword = null;

/**
 * @param {string} msg
 */
function showError(msg) {
  const el = document.getElementById('uc-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function hideError() {
  document.getElementById('uc-error')?.classList.add('hidden');
}

async function loadRoles() {
  const select = document.getElementById('uc-role');
  if (!select) {
    return;
  }

  const roles = await getAllRoles();
  select.innerHTML = '<option value="">Оберіть роль…</option>'
    + roles.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');

  if (roles.length === 0) {
    select.innerHTML += '<option value="" disabled>Спочатку створіть роль</option>';
  }
}

function showFormView() {
  document.getElementById('user-create-form-view')?.classList.remove('hidden');
  document.getElementById('user-create-success')?.classList.add('hidden');
  document.getElementById('user-create-form')?.reset();
  createdPassword = null;
  hideError();
}

/**
 * @param {string} login
 * @param {string} password
 */
function showSuccessView(login, password) {
  createdPassword = password;
  document.getElementById('user-create-form-view')?.classList.add('hidden');
  document.getElementById('user-create-success')?.classList.remove('hidden');

  const loginEl = document.getElementById('success-login');
  const pwEl = document.getElementById('success-password');
  if (loginEl) {
    loginEl.textContent = login;
  }
  if (pwEl) {
    pwEl.textContent = '••••••••';
    pwEl.dataset.visible = 'false';
  }
}

/**
 * @param {{ navigate: (path: string) => Promise<void> }} ctx
 */
export default async function init(ctx) {
  await loadRoles();

  document.getElementById('user-create-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const login = /** @type {HTMLInputElement} */ (document.getElementById('uc-login')).value.trim();
    const displayName = /** @type {HTMLInputElement} */ (document.getElementById('uc-display')).value.trim();
    const password = /** @type {HTMLInputElement} */ (document.getElementById('uc-password')).value;
    const passwordConfirm = /** @type {HTMLInputElement} */ (document.getElementById('uc-password-confirm')).value;
    const role = /** @type {HTMLSelectElement} */ (document.getElementById('uc-role')).value;
    const policy = /** @type {HTMLInputElement} */ (document.querySelector('input[name="passwordPolicy"]:checked'))?.value ?? 'never';
    const adminNote = /** @type {HTMLTextAreaElement} */ (document.getElementById('uc-note')).value;

    if (password !== passwordConfirm) {
      showError('Паролі не співпадають');
      return;
    }

    if (!role) {
      showError('Оберіть роль');
      return;
    }

    try {
      await createUser({
        login,
        displayName,
        password,
        role,
        passwordChangePolicy: policy,
        adminNote,
      });

      showSuccessView(login, password);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Помилка створення');
    }
  });

  document.getElementById('success-toggle-pw')?.addEventListener('click', () => {
    const pwEl = document.getElementById('success-password');
    if (!pwEl || !createdPassword) {
      return;
    }
    const visible = pwEl.dataset.visible === 'true';
    pwEl.textContent = visible ? '••••••••' : createdPassword;
    pwEl.dataset.visible = visible ? 'false' : 'true';
  });

  document.getElementById('success-copy')?.addEventListener('click', async () => {
    const login = document.getElementById('success-login')?.textContent ?? '';
    const text = `Логін: ${login}\nПароль: ${createdPassword ?? ''}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Дані скопійовано');
    } catch {
      showToast('Не вдалося скопіювати', 'error');
    }
  });

  document.getElementById('success-close')?.addEventListener('click', async () => {
    createdPassword = null;
    await ctx.navigate('/dashboard/users');
  });

  document.getElementById('success-another')?.addEventListener('click', () => {
    showFormView();
    loadRoles();
  });
}
