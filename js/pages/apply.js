/** Apply page — Netlify form + success state */

import { t } from '../core/i18n.js';
import { setPageMeta } from '../ui/public.js';

/** Must match name="account-request" in index.html / netlify-forms.html */
export const NETLIFY_FORM_NAME = 'account-request';

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
 * @param {FormData} formData
 * @returns {Promise<void>}
 */
async function submitToNetlify(formData) {
  const body = new URLSearchParams(formData);
  body.set('form-name', NETLIFY_FORM_NAME);

  const response = await fetch('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (response.ok) {
    return;
  }

  throw new Error(`Netlify form error (${response.status})`);
}

/**
 * @param {{ name: string, email: string, telegram: string | null, reason: string }} payload
 */
async function saveAccessRequest(payload) {
  const { createAccessRequest } = await import('../modules/requests.js');
  await createAccessRequest(payload);
}

export default async function init() {
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
    event.stopPropagation();

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

      await submitToNetlify(formData);

      try {
        await saveAccessRequest({
          ...payload,
          telegram: payload.telegram || null,
        });
      } catch (dbError) {
        console.warn('[apply] Supabase save failed (Netlify form was sent):', dbError);
      }

      window.history.replaceState({ path: '/apply' }, '', '/apply?success=1');
      showSuccessState();
    } catch (error) {
      console.error('[apply] submit failed:', error);
      window.alert(error instanceof Error ? error.message : t('errors.general'));
    } finally {
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = false;
        submitBtn.textContent = defaultLabel;
      }
    }
  }, true);
}
