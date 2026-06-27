/** Access requests — Netlify sync, approve/reject */

import db from '../core/db.js';
import { generateId } from '../core/crypto.js';
import { getSession, hasPermission } from '../core/auth.js';
import { logAction } from './log.js';
import { getSetting, setSetting } from './settings.js';

/**
 * @returns {Promise<object[]>}
 */
export async function getAllRequests() {
  const items = await db.getAll('accessRequests');
  return items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function getRequest(id) {
  return db.get('accessRequests', id);
}

/**
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createAccessRequest(data) {
  const request = {
    id: generateId('req'),
    name: String(data.name ?? '').trim(),
    email: String(data.email ?? '').trim(),
    telegram: data.telegram ? String(data.telegram).trim() : null,
    reason: String(data.reason ?? '').trim(),
    status: 'pending',
    netlifyId: data.netlifyId ?? null,
    processedAt: null,
    processedBy: null,
    createdAt: data.createdAt ?? Date.now(),
  };

  await db.put('accessRequests', request);
  return request;
}

/**
 * @param {string} id
 * @param {'approved' | 'rejected'} status
 * @returns {Promise<object>}
 */
async function processRequest(id, status) {
  if (!hasPermission('requests.process')) {
    throw new Error('No permission to process requests');
  }

  const existing = await getRequest(id);
  if (!existing) {
    throw new Error('Request not found');
  }

  const session = getSession();
  const updated = {
    ...existing,
    status,
    processedAt: Date.now(),
    processedBy: session?.userId ?? null,
  };

  await db.put('accessRequests', updated);

  await logAction(
    status === 'approved' ? 'requests.approve' : 'requests.reject',
    id,
    existing.name ?? existing.email ?? id,
    { email: existing.email },
    session?.userId ?? null,
  );

  return updated;
}

/**
 * @param {string} id
 * @returns {Promise<object>}
 */
export function approveRequest(id) {
  return processRequest(id, 'approved');
}

/**
 * @param {string} id
 * @returns {Promise<object>}
 */
export function rejectRequest(id) {
  return processRequest(id, 'rejected');
}

/**
 * @param {object} submission
 * @returns {Promise<object | null>}
 */
async function importNetlifySubmission(submission) {
  const data = submission.data ?? {};
  const netlifyId = submission.id ?? submission.uuid ?? null;

  if (!netlifyId) {
    return null;
  }

  const existing = await db.getAll('accessRequests');
  if (existing.some((item) => item.netlifyId === netlifyId)) {
    return null;
  }

  return createAccessRequest({
    name: data.name ?? data['full-name'] ?? '',
    email: data.email ?? '',
    telegram: data.telegram ?? data.Telegram ?? null,
    reason: data.reason ?? data.message ?? '',
    netlifyId,
    createdAt: submission.created_at ? new Date(submission.created_at).getTime() : Date.now(),
  });
}

/**
 * @returns {Promise<number>}
 */
export async function syncFromNetlify() {
  const siteId = await getSetting('netlify_site_id');
  const token = await getSetting('netlify_access_token');

  if (!siteId || !token) {
    throw new Error('Netlify is not configured in Settings');
  }

  const formsRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/forms`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!formsRes.ok) {
    throw new Error(`Netlify API error (${formsRes.status})`);
  }

  const forms = await formsRes.json();
  const form = forms.find((item) => item.name === 'account-request');

  if (!form?.id) {
    throw new Error('Form "account-request" not found on Netlify');
  }

  const submissionsRes = await fetch(`https://api.netlify.com/api/v1/forms/${form.id}/submissions`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!submissionsRes.ok) {
    throw new Error(`Netlify submissions error (${submissionsRes.status})`);
  }

  const submissions = await submissionsRes.json();
  let imported = 0;

  for (const submission of submissions) {
    const created = await importNetlifySubmission(submission);
    if (created) {
      imported += 1;
    }
  }

  await setSetting('netlify_last_sync_at', Date.now());
  return imported;
}

export default {
  getAllRequests,
  getRequest,
  createAccessRequest,
  approveRequest,
  rejectRequest,
  syncFromNetlify,
};
