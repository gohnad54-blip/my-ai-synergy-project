/** About page — club info from settings */

import { t } from '../core/i18n.js';
import { getPublicSetting } from '../modules/public-content.js';
import { setPageMeta } from '../ui/public.js';

export default async function init() {
  setPageMeta({
    title: t('about.meta.title'),
    description: t('about.meta.description'),
  });

  const aboutText = await getPublicSetting(
    'about_text',
    'AI Synergy — спільнота ентузіастів штучного інтелекту. Архів зберігає матеріали зустрічей, статті та записи для членів клубу.',
  );

  const content = document.getElementById('about-content');
  if (content) {
    content.textContent = aboutText;
    content.removeAttribute('data-i18n');
  }
}
