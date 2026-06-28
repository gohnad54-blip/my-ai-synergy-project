/** Setup page — first-run admin account creation */

import db from '../core/db.js';
import { login } from '../core/auth.js';
import { deriveEncryptionKey, generateId, hashPassword } from '../core/crypto.js';
import { markInitialized } from '../../config/init.js';
import { logAction } from '../modules/log.js';

const LOGIN_PATTERN = /^[a-zA-Z0-9]{4,}$/;

/**
 * @param {string} login
 * @param {string} displayName
 * @param {string} password
 * @param {string} passwordConfirm
 * @returns {string | null}
 */
function validateForm(login, displayName, password, passwordConfirm) {
  const trimmedLogin = login.trim();

  if (!LOGIN_PATTERN.test(trimmedLogin)) {
    return 'Логін: лише латиниця та цифри, мінімум 4 символи';
  }

  if (!displayName.trim()) {
    return 'Введіть ім\'я для відображення';
  }

  if (password.length < 8) {
    return 'Пароль має містити мінімум 8 символів';
  }

  if (password !== passwordConfirm) {
    return 'Паролі не співпадають';
  }

  return null;
}

/**
 * @param {HTMLElement | null} el
 * @param {string} message
 */
function showError(el, message) {
  if (!el) {
    return;
  }
  el.textContent = message;
  el.classList.remove('hidden');
}

/**
 * @param {HTMLElement | null} el
 */
function hideError(el) {
  if (!el) {
    return;
  }
  el.textContent = '';
  el.classList.add('hidden');
}

/**
 * @param {{ navigate: (path: string, replace?: boolean) => Promise<void> }} ctx
 */
export default function init(ctx) {
  const form = document.getElementById('setup-form');
  const errorEl = document.getElementById('setup-error');
  const submitBtn = document.getElementById('setup-submit');
  const passwordInput = /** @type {HTMLInputElement | null} */ (document.getElementById('setup-password'));
  const confirmInput = /** @type {HTMLInputElement | null} */ (document.getElementById('setup-password-confirm'));
  const toggleBtn = document.getElementById('toggle-password');

  if (!form) {
    return;
  }

  toggleBtn?.addEventListener('click', () => {
    if (!passwordInput || !confirmInput) {
      return;
    }
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    confirmInput.type = show ? 'text' : 'password';
    toggleBtn.textContent = show ? '🙈' : '👁';
    toggleBtn.setAttribute('aria-label', show ? 'Приховати пароль' : 'Показати пароль');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(errorEl);

    const loginInput = /** @type {HTMLInputElement} */ (document.getElementById('setup-login'));
    const displayInput = /** @type {HTMLInputElement} */ (document.getElementById('setup-display-name'));

    const loginValue = loginInput.value.trim();
    const displayName = displayInput.value.trim();
    const password = passwordInput?.value ?? '';
    const passwordConfirm = confirmInput?.value ?? '';

    const validationError = validateForm(loginValue, displayName, password, passwordConfirm);
    if (validationError) {
      showError(errorEl, validationError);
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Створення…';
    }

    try {
      await db.init();

      const existing = await db.getUserForLogin(loginValue);
      if (existing) {
        showError(errorEl, 'Цей логін уже зайнятий');
        return;
      }

      const { hash, salt } = await hashPassword(password);
      const encKey = await deriveEncryptionKey(password, salt);
      db.setEncryptionKey(encKey);

      const userId = generateId('usr');
      const user = {
        id: userId,
        login: loginValue,
        passwordHash: hash,
        passwordSalt: salt,
        displayName,
        role: 'admin',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.put('users', user);
      await markInitialized();

      const authResult = await login(loginValue, password);

      if (!authResult.success) {
        showError(errorEl, authResult.error ?? 'Акаунт створено, але автоматичний вхід не вдався. Спробуйте увійти вручну.');
        await ctx.navigate('/login', true);
        return;
      }

      await logAction('users.create', userId, loginValue, { setup: true }, userId);

      await ctx.navigate('/dashboard', true);
    } catch (error) {
      db.setEncryptionKey(null);
      const message = error instanceof Error ? error.message : 'Не вдалося створити архів';
      showError(errorEl, message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Створити архів';
      }
    }
  });
}
