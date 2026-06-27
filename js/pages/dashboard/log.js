/** Activity log page — filters, list, CSV export */

import { t } from '../../core/i18n.js';
import db from '../../core/db.js';
import {
  exportLogCsv,
  formatActionLabel,
  formatLogTimeShort,
  getActionLog,
  resolveActorName,
  exportLogCsv,
} from '../../modules/log.js';

/** @type {object[]} */
let currentEntries = [];

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @returns {{ action: string, actorId: string, dateFrom: number | null, dateTo: number | null }}
 */
function readFilters() {
  const action = /** @type {HTMLSelectElement | null} */ (document.getElementById('log-filter-action'))?.value ?? '';
  const actorId = /** @type {HTMLSelectElement | null} */ (document.getElementById('log-filter-user'))?.value ?? '';
  const fromVal = /** @type {HTMLInputElement | null} */ (document.getElementById('log-date-from'))?.value;
  const toVal = /** @type {HTMLInputElement | null} */ (document.getElementById('log-date-to'))?.value;

  let dateFrom = null;
  let dateTo = null;

  if (fromVal) {
    dateFrom = new Date(`${fromVal}T00:00:00`).getTime();
  }
  if (toVal) {
    dateTo = new Date(`${toVal}T23:59:59.999`).getTime();
  }

  return { action, actorId, dateFrom, dateTo };
}

/**
 * @param {object[]} entries
 */
async function renderLogList(entries) {
  const container = document.getElementById('log-list');
  if (!container) {
    return;
  }

  currentEntries = entries;

  if (entries.length === 0) {
    container.innerHTML = `<p class="text-sm text-dim-text">${escapeHtml(t('log.empty'))}</p>`;
    return;
  }

  const cache = new Map();
  const rows = await Promise.all(entries.map(async (entry) => {
    const actor = await resolveActorName(entry, cache);
    const action = formatActionLabel(entry.action);
    const target = entry.targetTitle ? ` «${entry.targetTitle}»` : '';

    return `
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-pulse-violet/10 py-3 text-sm last:border-0">
        <span class="font-mono text-xs text-dim-text">${formatLogTimeShort(entry.timestamp)}</span>
        <span class="font-medium text-starfield-white">${escapeHtml(actor)}</span>
        <span class="text-dim-text">${escapeHtml(action)}${escapeHtml(target)}</span>
      </div>
    `;
  }));

  container.innerHTML = rows.join('');
}

async function populateFilterOptions() {
  const allEntries = await db.getAll('actionLog');
  const actionSelect = document.getElementById('log-filter-action');
  const userSelect = document.getElementById('log-filter-user');

  if (actionSelect instanceof HTMLSelectElement) {
    const actions = [...new Set(allEntries.map((e) => e.action).filter(Boolean))].sort();
    actionSelect.innerHTML = [
      `<option value="">${escapeHtml(t('log.filterAllActions'))}</option>`,
      ...actions.map((action) => `<option value="${escapeHtml(action)}">${escapeHtml(formatActionLabel(action))}</option>`),
    ].join('');
  }

  if (userSelect instanceof HTMLSelectElement) {
    const actorIds = [...new Set(allEntries.map((e) => e.actorId).filter((id) => id && id !== 'system'))];
    const users = await Promise.all(actorIds.map((id) => db.get('users', id)));
    const options = users
      .filter(Boolean)
      .sort((a, b) => (a.displayName ?? a.login ?? '').localeCompare(b.displayName ?? b.login ?? '', 'uk'))
      .map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.displayName ?? user.login)}</option>`);

    userSelect.innerHTML = [
      `<option value="">${escapeHtml(t('log.filterAllUsers'))}</option>`,
      ...options,
    ].join('');
  }
}

async function refresh() {
  const filters = readFilters();
  const entries = await getActionLog({
    action: filters.action || undefined,
    actorId: filters.actorId || undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
  await renderLogList(entries);
}

function bindEvents() {
  ['log-filter-action', 'log-filter-user', 'log-date-from', 'log-date-to'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      void refresh();
    });
  });

  document.getElementById('log-export-csv')?.addEventListener('click', async () => {
    const csv = await exportLogCsv(currentEntries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `ai-synergy-log-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  });
}

export default async function init() {
  await populateFilterOptions();
  bindEvents();
  await refresh();
}
