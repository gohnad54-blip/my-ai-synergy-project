/** Apply page — Netlify form + success state */

import { t } from '../core/i18n.js';
import { setPageMeta } from '../ui/public.js';

export default async function init() {
  setPageMeta({
    title: t('apply.title'),
    description: t('apply.subtitle'),
  });

  const params = new URLSearchParams(window.location.search);
  const submitted = params.has('success') || params.has('submitted');

  if (submitted) {
    document.getElementById('apply-success')?.classList.remove('hidden');
    document.getElementById('apply-form-wrap')?.classList.add('hidden');
  }
}
