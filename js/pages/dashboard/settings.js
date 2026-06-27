/** Settings page — backup and Netlify config */

import { getDateLocale, t } from '../../core/i18n.js';
import { downloadBackupFile, exportBackup, getLastBackupAt, importBackupFile } from '../../modules/backup.js';
import { getSetting, setSetting } from '../../modules/settings.js';
import { confirmModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';

/**
 * @returns {Promise<void>}
 */
async function refreshLastBackupLabel() {
  const label = document.getElementById('backup-last-label');
  if (!label) {
    return;
  }

  const lastAt = await getLastBackupAt();
  if (!lastAt) {
    label.textContent = t('settings.lastBackupNever');
    return;
  }

  const date = new Date(lastAt).toLocaleString(getDateLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  label.textContent = t('settings.lastBackupAt', { date });
}

/**
 * @returns {Promise<void>}
 */
async function loadNetlifySettings() {
  const siteId = await getSetting('netlify_site_id', '');
  const token = await getSetting('netlify_access_token', '');

  const siteInput = document.getElementById('netlify-site-id');
  const tokenInput = document.getElementById('netlify-access-token');

  if (siteInput instanceof HTMLInputElement) {
    siteInput.value = String(siteId ?? '');
  }
  if (tokenInput instanceof HTMLInputElement) {
    tokenInput.value = String(token ?? '');
  }
}

function bindEvents() {
  document.getElementById('backup-export-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('backup-export-btn');
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
    }

    try {
      const backup = await exportBackup();
      downloadBackupFile(backup);
      await refreshLastBackupLabel();
      showToast(t('settings.exportSuccess'), 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('errors.general'), 'error');
    } finally {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
      }
    }
  });

  document.getElementById('backup-import-input')?.addEventListener('change', async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
      return;
    }

    const confirmed = await confirmModal(t('settings.confirmImport'));
    if (!confirmed) {
      input.value = '';
      return;
    }

    try {
      await importBackupFile(input.files[0]);
      showToast(t('settings.importSuccess'), 'success');
      window.dispatchEvent(new CustomEvent('app:navigate', {
        detail: { path: '/login', replace: true },
      }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('errors.general'), 'error');
    } finally {
      input.value = '';
    }
  });

  document.getElementById('netlify-settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const siteId = /** @type {HTMLInputElement | null} */ (document.getElementById('netlify-site-id'))?.value.trim();
    const token = /** @type {HTMLInputElement | null} */ (document.getElementById('netlify-access-token'))?.value.trim();

    await setSetting('netlify_site_id', siteId ?? '');
    await setSetting('netlify_access_token', token ?? '');
    showToast(t('settings.netlifySaved'), 'success');
  });
}

export default async function init() {
  bindEvents();
  await Promise.all([refreshLastBackupLabel(), loadNetlifySettings()]);
}
