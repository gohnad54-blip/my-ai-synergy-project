/** Login page controller */

import { getLoginLockoutRemainingMs, login } from '../core/auth.js';
import { t } from '../core/i18n.js';
import { safeReturnPath } from '../core/security.js';

/**
 * @param {number} ms
 * @returns {string}
 */
function formatLockoutMessage(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return t('login.locked', { minutes });
}

/**
 * @param {HTMLElement | null} errorEl
 * @param {HTMLButtonElement | null} submitBtn
 * @param {HTMLInputElement | null} loginInput
 * @param {HTMLInputElement | null} passwordInput
 */
function applyLockoutUi(errorEl, submitBtn, loginInput, passwordInput) {
  const remaining = getLoginLockoutRemainingMs();
  if (remaining <= 0) {
    return;
  }

  if (errorEl) {
    errorEl.textContent = formatLockoutMessage(remaining);
    errorEl.classList.remove('hidden');
  }

  if (submitBtn) {
    submitBtn.disabled = true;
  }

  if (loginInput) {
    loginInput.disabled = true;
  }

  if (passwordInput) {
    passwordInput.disabled = true;
  }
}

/**
 * @param {{ navigate: (path: string, replace?: boolean) => Promise<void> }} ctx
 */
export default async function init(ctx) {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const submitBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('login-submit'));
  const loginInput = /** @type {HTMLInputElement | null} */ (document.getElementById('login'));
  const passwordInput = /** @type {HTMLInputElement | null} */ (document.getElementById('password'));

  if (!form) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const returnPath = params.get('return');

  applyLockoutUi(errorEl, submitBtn, loginInput, passwordInput);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const rememberInput = /** @type {HTMLInputElement} */ (document.getElementById('remember'));

    if (errorEl) {
      errorEl.classList.add('hidden');
      errorEl.textContent = '';
    }

    if (getLoginLockoutRemainingMs() > 0) {
      applyLockoutUi(errorEl, submitBtn, loginInput, passwordInput);
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = t('login.submitting');
    }

    if (loginInput) {
      loginInput.disabled = false;
    }
    if (passwordInput) {
      passwordInput.disabled = false;
    }

    const result = await login(
      loginInput?.value ?? '',
      passwordInput?.value ?? '',
      rememberInput?.checked ?? false,
    );

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = t('login.submit');
    }

    if (!result.success) {
      if (result.error === 'LOGIN_LOCKED' && result.lockRemainingMs) {
        applyLockoutUi(errorEl, submitBtn, loginInput, passwordInput);
        if (errorEl) {
          errorEl.textContent = formatLockoutMessage(result.lockRemainingMs);
          errorEl.classList.remove('hidden');
        }
        return;
      }

      if (errorEl) {
        errorEl.textContent = result.error ?? t('login.error');
        errorEl.classList.remove('hidden');
      }
      return;
    }

    const destination = safeReturnPath(returnPath);
    await ctx.navigate(destination, true);
  });
}
