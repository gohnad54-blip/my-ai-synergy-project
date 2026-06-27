/** Apply page — Netlify form + success state */

import { t } from '../core/i18n.js';
import { createAccessRequest } from '../modules/requests.js';
import { setPageMeta } from '../ui/public.js';

/**
 * @returns {boolean}
 */
function isSuccessUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.has('success') || params.has('submitted');
}

function showSuccessState() {
  document.getElementById('apply-success')?.classList.remove('hidden');
  document.getElementById('apply-form-wrap')?.classList.add('hidden');
}

/**
 * @param {{ navigate?: (path: string, replace?: boolean) => Promise<void> }} [ctx]
 */
export default async function init(ctx = {}) {
  setPageMeta({
    title: t('apply.title'),
    description: t('apply.subtitle'),
  });

  if (isSuccessUrl()) {
    showSuccessState();
  }

  const form = document.getElementById('apply-form');
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    const defaultLabel = submitBtn?.textContent ?? t('apply.submit');

    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = true;
      submitBtn.textContent = t('apply.submitting');
    }

    try {
      const formData = new FormData(form);
      const payload = {
        name: String(formData.get('name') ?? '').trim(),
        email: String(formData.get('email') ?? '').trim(),
        telegram: String(formData.get('telegram') ?? '').trim(),
        reason: String(formData.get('reason') ?? '').trim(),
      };

      const response = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(formData).toString(),
      });

      if (!response.ok) {
        throw new Error(`Netlify form error (${response.status})`);
      }

      await createAccessRequest({
        ...payload,
        telegram: payload.telegram || null,
      });

      showSuccessState();

      if (typeof ctx.navigate === 'function') {
        await ctx.navigate('/apply?success=1', true);
      } else {
        window.history.replaceState({}, '', '/apply?success=1');
      }
    } catch (error) {
      console.error('[apply] submit failed:', error);
      window.alert(error instanceof Error ? error.message : t('errors.general'));
    } finally {
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = false;
        submitBtn.textContent = defaultLabel;
      }
    }
  });
}
