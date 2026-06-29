/** Chat message attachment rendering */

import {
  fetchReactions,
  summarizeReactions,
} from '../modules/reactions.js';
import { renderReactionsBar } from './reactions.js';
import { toVideoEmbedUrl } from './public.js';
import {
  formatFileSize,
  getAttachmentDisplayUrl,
  getAttachmentSignedUrl,
  isStorageAttachment,
  normalizeAttachmentFields,
  resolveDisplayAttachmentType,
} from '../modules/chat-attachments.js';

const MEDIA_MAX = '320px';

/** @type {HTMLElement | null} */
let lightboxRoot = null;

/**
 * @param {string} url
 * @param {string} alt
 */
function openImageLightbox(url, alt) {
  if (!lightboxRoot) {
    lightboxRoot = document.createElement('div');
    lightboxRoot.id = 'chat-image-lightbox';
    lightboxRoot.className = 'fixed inset-0 z-[110] hidden items-center justify-center bg-black/92 p-4 backdrop-blur-sm';
    lightboxRoot.innerHTML = `
      <button type="button" data-lightbox-close
        class="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-space-void/80 text-2xl text-white hover:bg-space-void"
        aria-label="Close">×</button>
      <img data-lightbox-img class="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] object-contain" alt="">
    `;
    document.body.appendChild(lightboxRoot);

    lightboxRoot.querySelector('[data-lightbox-close]')?.addEventListener('click', closeImageLightbox);
    lightboxRoot.addEventListener('click', (e) => {
      if (e.target === lightboxRoot) {
        closeImageLightbox();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeImageLightbox();
      }
    });
  }

  const img = lightboxRoot.querySelector('[data-lightbox-img]');
  if (img instanceof HTMLImageElement) {
    img.src = url;
    img.alt = alt;
  }

  lightboxRoot.classList.remove('hidden');
  lightboxRoot.classList.add('flex');
  document.body.classList.add('overflow-hidden');
}

function closeImageLightbox() {
  if (!lightboxRoot) {
    return;
  }
  lightboxRoot.classList.add('hidden');
  lightboxRoot.classList.remove('flex');
  const img = lightboxRoot.querySelector('[data-lightbox-img]');
  if (img instanceof HTMLImageElement) {
    img.removeAttribute('src');
  }
  document.body.classList.remove('overflow-hidden');
}

/**
 * @param {string} filename
 * @returns {string}
 */
function videoMimeFromName(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.webm')) {
    return 'video/webm';
  }
  if (lower.endsWith('.mov')) {
    return 'video/quicktime';
  }
  return 'video/mp4';
}

/**
 * @param {object} msg
 * @param {{ displayUrl: string | null, downloadUrl: string | null }} urls
 * @param {(key: string) => string} t
 * @returns {string}
 */
function renderAttachmentBlock(msg, urls, t) {
  const { displayUrl, downloadUrl } = urls;
  const type = resolveDisplayAttachmentType(msg);
  const { attachmentUrl, attachmentName } = normalizeAttachmentFields(msg);

  if (!type) {
    return '';
  }

  if (type === 'video_link' && attachmentUrl) {
    const embed = toVideoEmbedUrl(attachmentUrl);
    if (embed) {
      return `
        <div class="mt-2 overflow-hidden rounded-lg border border-pulse-violet/20" style="max-width:${MEDIA_MAX}">
          <iframe src="${escapeHtml(embed)}" class="aspect-video w-full" allowfullscreen loading="lazy"
            title="${escapeHtml(t('chat.videoLink'))}"></iframe>
        </div>`;
    }
    return `<a href="${escapeHtml(attachmentUrl)}" target="_blank" rel="noopener"
      class="mt-2 block text-sm text-synapse-blue hover:text-neural-glow">${escapeHtml(attachmentUrl)}</a>`;
  }

  if (!displayUrl) {
    return `<p class="mt-2 text-xs text-dim-text">${escapeHtml(t('chat.attachmentUnavailable'))}</p>`;
  }

  if (type === 'image') {
    const alt = escapeHtml(attachmentName ?? t('chat.previewImage'));
    return `
      <button type="button" data-chat-image-open
        class="mt-2 block overflow-hidden rounded-lg border border-pulse-violet/20 bg-black/20"
        style="max-width:${MEDIA_MAX};max-height:${MEDIA_MAX}">
        <img src="${escapeHtml(displayUrl)}" alt="${alt}"
          class="block max-h-[320px] max-w-[320px] w-auto h-auto object-contain"
          loading="lazy" decoding="async">
      </button>`;
  }

  if (type === 'video') {
    const name = attachmentName ?? attachmentUrl?.split('/').pop() ?? '';
    const mime = videoMimeFromName(name);
    return `
      <video controls playsinline preload="metadata"
        class="mt-2 block max-h-[320px] max-w-[320px] w-auto rounded-lg border border-pulse-violet/20 bg-black/40"
        style="max-width:${MEDIA_MAX};max-height:${MEDIA_MAX}">
        <source src="${escapeHtml(displayUrl)}" type="${escapeHtml(mime)}">
      </video>`;
  }

  const name = escapeHtml(attachmentName ?? t('chat.file'));
  const size = formatFileSize(msg.attachmentSize);
  const fileHref = downloadUrl ?? displayUrl;
  return `
    <div class="mt-2 flex max-w-xs items-center gap-3 rounded-lg border border-pulse-violet/20 bg-nebula-deep/50 px-3 py-2">
      <span class="text-xl" aria-hidden="true">📄</span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm text-starfield-white">${name}</p>
        <p class="text-xs text-dim-text">${escapeHtml(size)}</p>
      </div>
      <a href="${escapeHtml(fileHref)}" download="${name}" target="_blank" rel="noopener"
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
  const targetType = mode === 'group' ? 'group_message' : 'private_message';
  const reactionRows = await fetchReactions(targetType, messages.map((m) => m.id));
  const reactionMap = summarizeReactions(reactionRows);

  const parts = await Promise.all(messages.map(async (msg) => {
    const mine = msg.senderId === ctx.sessionUserId;
    const align = mine ? 'ml-auto bg-pulse-violet/30' : 'mr-auto bg-space-void/80';
    const deleteBtn = mode === 'group' && ctx.canDeleteGroupMessage(msg)
      ? `<button type="button" data-delete-group-msg="${escapeHtml(msg.id)}"
          class="mt-1 text-xs text-dim-text hover:text-red-400">${ctx.t('chat.deleteMessage')}</button>`
      : '';

    const { attachmentUrl } = normalizeAttachmentFields(msg);
    let displayUrl = null;
    let downloadUrl = null;
    if (isStorageAttachment(msg)) {
      displayUrl = await getAttachmentDisplayUrl(attachmentUrl);
      downloadUrl = await getAttachmentSignedUrl(attachmentUrl);
    }

    const bodyHtml = msg.body?.trim()
      ? `<p class="whitespace-pre-wrap break-words text-sm text-starfield-white">${escapeHtml(msg.body)}</p>`
      : '';

    const attachmentHtml = renderAttachmentBlock(msg, { displayUrl, downloadUrl }, ctx.t);
    const reactionSummary = reactionMap.get(msg.id) ?? { counts: {}, mine: null, mineId: null };
    const reactionsHtml = renderReactionsBar(targetType, msg.id, reactionSummary);

    return `
      <div class="max-w-[85%] rounded-lg border border-pulse-violet/15 px-3 py-2 ${align}" data-msg-id="${escapeHtml(msg.id)}">
        ${!mine ? `<p class="mb-1 text-xs font-medium text-neural-glow">${escapeHtml(ctx.displayName(msg.senderId))}</p>` : ''}
        ${bodyHtml}
        ${attachmentHtml}
        ${reactionsHtml}
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
  container.querySelectorAll('[data-chat-image-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const thumb = btn.querySelector('img');
      const url = thumb instanceof HTMLImageElement ? thumb.currentSrc || thumb.src : null;
      const alt = thumb instanceof HTMLImageElement ? thumb.alt : '';
      if (url) {
        openImageLightbox(url, alt);
      }
    });
  });
}

export default {
  buildChatMessagesHtml,
  bindChatImageLightbox,
  closeImageLightbox,
};
