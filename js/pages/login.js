/** Login page controller */

import { login } from '../core/auth.js';
import { t } from '../core/i18n.js';

/**
 * @param {{ navigate: (path: string, replace?: boolean) => Promise<void> }} ctx
 */
export default async function init(ctx) {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');

  if (!form) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const returnPath = params.get('return') ?? '/dashboard';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const loginInput = /** @type {HTMLInputElement} */ (document.getElementById('login'));
    const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById('password'));
    const rememberInput = /** @type {HTMLInputElement} */ (document.getElementById('remember'));

    if (errorEl) {
      errorEl.classList.add('hidden');
      errorEl.textContent = '';
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = t('login.submitting');
    }

    const result = await login(
      loginInput.value,
      passwordInput.value,
      rememberInput?.checked ?? false,
    );

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = t('login.submit');
    }

    if (!result.success) {
      if (errorEl) {
        errorEl.textContent = result.error ?? t('login.error');
        errorEl.classList.remove('hidden');
      }
      return;
    }

    const destination = returnPath.startsWith('/') ? decodeURIComponent(returnPath) : '/dashboard';
    await ctx.navigate(destination, true);
  });
}
