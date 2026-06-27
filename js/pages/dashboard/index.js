/** Dashboard home — stats, recent log, new requests */

import db from '../../core/db.js';
import { getSession, hasPermission } from '../../core/auth.js';
import { t } from '../../core/i18n.js';
import {
  formatActionLabel,
  formatLogTimeShort,
  resolveActorName,
} from '../../modules/log.js';

/**
 * @param {{ getSession: () => object | null }} ctx
 */
export default async function init(ctx) {
  const session = ctx.getSession();
  const nameEl = document.getElementById('dashboard-user-name');

  if (nameEl && session) {
    nameEl.textContent = session.displayName ?? session.userId;
  }

  await loadStats();
  await loadRecentLog();
  await loadNewRequests();
}

async function loadStats() {
  const [materials, users, requests] = await Promise.all([
    db.getAll('materials'),
    db.getAll('users'),
    db.getAll('accessRequests'),
  ]);

  const activeMaterials = materials.filter((m) => !m.deletedAt);
  const trashCount = materials.filter((m) => m.deletedAt).length;
  const pendingRequests = requests.filter(
    (r) => r.status === 'new' || r.status === 'pending',
  );

  setText('stat-materials', String(activeMaterials.length));
  setText('stat-users', String(users.filter((u) => u.status !== 'inactive').length));
  setText('stat-requests', String(pendingRequests.length));
  setText('stat-trash', String(trashCount));
}

async function loadRecentLog() {
  const container = document.getElementById('recent-log');
  if (!container) {
    return;
  }

  const entries = await db.getAll('actionLog');
  const sorted = entries
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = `<p class="text-sm text-dim-text">${escapeHtml(t('log.empty'))}</p>`;
    return;
  }

  const userCache = new Map();
  const rows = await Promise.all(sorted.map(async (entry) => {
    const actorName = await resolveActorName(entry, userCache);
    const target = entry.targetTitle ? ` «${entry.targetTitle}»` : '';

    return `
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-pulse-violet/10 py-2 text-sm last:border-0">
        <span class="font-mono text-xs text-dim-text">${formatLogTimeShort(entry.timestamp)}</span>
        <span class="font-medium">${escapeHtml(actorName)}</span>
        <span class="text-dim-text">${escapeHtml(formatActionLabel(entry.action))}${escapeHtml(target)}</span>
      </div>
    `;
  }));

  container.innerHTML = rows.join('');
}

async function loadNewRequests() {
  if (!hasPermission('requests.view')) {
    return;
  }

  const section = document.getElementById('new-requests-section');
  const list = document.getElementById('new-requests-list');
  if (!section || !list) {
    return;
  }

  const requests = await db.getAll('accessRequests');
  const pending = requests
    .filter((r) => r.status === 'new' || r.status === 'pending')
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 5);

  if (pending.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  list.innerHTML = pending.map((req) => `
    <div class="rounded-xl border border-synapse-blue/30 bg-nebula-deep/50 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded bg-synapse-blue/20 px-2 py-0.5 text-xs text-synapse-blue">НОВА</span>
        <span class="font-medium">${escapeHtml(req.name ?? req.email ?? 'Заявка')}</span>
        ${req.email ? `<span class="text-sm text-dim-text">${escapeHtml(req.email)}</span>` : ''}
      </div>
      ${req.reason ? `<p class="mt-2 text-sm text-dim-text line-clamp-2">${escapeHtml(req.reason)}</p>` : ''}
      <a href="/dashboard/requests" class="mt-3 inline-block text-sm text-neural-glow hover:underline">Переглянути заявки →</a>
    </div>
  `).join('');
}

/**
 * @param {string} id
 * @param {string} value
 */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
