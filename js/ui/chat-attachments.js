/** Chat message attachment rendering */

import { escapeHtml } from '../core/security.js';
import { toVideoEmbedUrl } from './public.js';
import {
  formatFileSize,
  getAttachmentSignedUrl,
  isStorageAttachment,
} from '../modules/chat-attachments.js';

/**
 * @param {object} msg
 * @param {string} signedUrl
 * @param {(key: string) => string} t
 * @returns {string}
 */
function renderAttachmentBlock(msg, signedUrl, t) {
  const type = msg.attachmentType;
  if (!type) {
    return '';
  }

  if (type === 'video_link' && msg.attachmentUrl) {
    const embed = toVideoEmbedUrl(msg.attachmentUrl);
    if (embed) {
      return `
        <div class="mt-2 overflow-hidden rounded-lg border border-pulse-violet/20">
          <iframe src="${escapeHtml(embed)}" class="aspect-video w-full max-w-md" allowfullscreen loading="lazy"
            title="${escapeHtml(t('chat.videoLink'))}"></iframe>
        </div>`;
    }
    return `<a href="${escapeHtml(msg.attachmentUrl)}" target="_blank" rel="noopener"
      class="mt-2 block text-sm text-synapse-blue hover:text-neural-glow">${escapeHtml(msg.attachmentUrl)}</a>`;
  }

  if (!signedUrl) {
    return `<p class="mt-2 text-xs text-dim-text">${escapeHtml(t('chat.attachmentUnavailable'))}</p>`;
  }

  if (type === 'image') {
    return `
      <button type="button" data-chat-image-full="${escapeHtml(signedUrl)}"
        class="mt-2 block max-w-xs overflow-hidden rounded-lg border border-pulse-violet/20">
        <img src="${escapeHtml(signedUrl)}" alt="${escapeHtml(msg.attachmentName ?? '')}"
          class="max-h-48 w-full object-cover" loading="lazy" decoding="async">
      </button>`;
  }

  if (type === 'video') {
    return `
      <video controls class="mt-2 max-h-64 max-w-md rounded-lg border border-pulse-violet/20" preload="metadata">
        <source src="${escapeHtml(signedUrl)}" type="video/mp4">
      </video>`;
  }

  const name = escapeHtml(msg.attachmentName ?? t('chat.file'));
  const size = formatFileSize(msg.attachmentSize);
  return `
    <div class="mt-2 flex max-w-xs items-center gap-3 rounded-lg border border-pulse-violet/20 bg-nebula-deep/50 px-3 py-2">
      <span class="text-xl" aria-hidden="true">📄</span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm text-starfield-white">${name}</p>
        <p class="text-xs text-dim-text">${escapeHtml(size)}</p>
      </div>
      <a href="${escapeHtml(signedUrl)}" download="${name}"
        class="shrink-0 rounded border border-pulse-violet/30 px-2 py-1 text-xs text-neural-glow hover:border-neural-glow">
        ${escapeHtml(t('chat.download'))}
      </a>
    </div>`;
}

/**
 * @param {object[]} messages
 * @param {'private' | 'group'} mode
 * @param {{
 *   t: (key: string) => string,
 *   formatChatTime: (ts: number) => string,
 *   displayName: (id: string) => string,
 *   canDeleteGroupMessage: (msg: object) => boolean,
 *   sessionUserId: string | undefined,
 * }} ctx
 * @returns {Promise<string>}
 */
export async function buildChatMessagesHtml(messages, mode, ctx) {
  const parts = await Promise.all(messages.map(async (msg) => {
    const mine = msg.senderId === ctx.sessionUserId;
    const align = mine ? 'ml-auto bg-pulse-violet/30' : 'mr-auto bg-space-void/80';
    const deleteBtn = mode === 'group' && ctx.canDeleteGroupMessage(msg)
      ? `<button type="button" data-delete-group-msg="${escapeHtml(msg.id)}"
          class="mt-1 text-xs text-dim-text hover:text-red-400">${ctx.t('chat.deleteMessage')}</button>`
      : '';

    let signedUrl = null;
    if (isStorageAttachment(msg)) {
      signedUrl = await getAttachmentSignedUrl(msg.attachmentUrl);
    }

    const bodyHtml = msg.body?.trim()
      ? `<p class="whitespace-pre-wrap break-words text-sm text-starfield-white">${escapeHtml(msg.body)}</p>`
      : '';

    const attachmentHtml = renderAttachmentBlock(msg, signedUrl, ctx.t);

    return `
      <div class="max-w-[85%] rounded-lg border border-pulse-violet/15 px-3 py-2 ${align}" data-msg-id="${escapeHtml(msg.id)}">
        ${!mine ? `<p class="mb-1 text-xs font-medium text-neural-glow">${escapeHtml(ctx.displayName(msg.senderId))}</p>` : ''}
        ${bodyHtml}
        ${attachmentHtml}
        <p class="mt-1 text-right text-[10px] text-dim-text">${ctx.formatChatTime(msg.createdAt)}</p>
        ${deleteBtn}
      </div>
    `;
  }));

  return parts.join('');
}

/**
 * @param {HTMLElement} container
 */
export function bindChatImageLightbox(container) {
  container.querySelectorAll('[data-chat-image-full]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-chat-image-full');
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  });
}

export default {
  buildChatMessagesHtml,
  bindChatImageLightbox,
};
