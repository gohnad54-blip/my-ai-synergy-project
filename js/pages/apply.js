/** Apply page — Netlify form + success state */

import { t } from '../core/i18n.js';
import { setPageMeta } from '../ui/public.js';

/** Must match name + form-name in forms.html (Netlify Dashboard → Forms) */
export const NETLIFY_FORM_NAME = 'account-request';

/** POST here — not "/" (SPA rewrite /* → index.html breaks form handler) */
export const NETLIFY_FORM_ENDPOINT = '/forms.html';

/**
 * @param {{ name: string, email: string, telegram: string, reason: string }} payload
 * @returns {Promise<void>}
 */
async function submitToNetlify(payload) {
  const body = new URLSearchParams({
    'form-name': NETLIFY_FORM_NAME,
    name: payload.name,
    email: payload.email,
    telegram: payload.telegram,
    reason: payload.reason,
    'bot-field': '',
  });

  const response = await fetch(NETLIFY_FORM_ENDPOINT, {
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

    const payload = {
      name: String(new FormData(form).get('name') ?? '').trim(),
      email: String(new FormData(form).get('email') ?? '').trim(),
      telegram: String(new FormData(form).get('telegram') ?? '').trim(),
      reason: String(new FormData(form).get('reason') ?? '').trim(),
    };

    try {
      await submitToNetlify(payload);

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
