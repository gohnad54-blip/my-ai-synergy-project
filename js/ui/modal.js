/** Modal dialogs */

import { escapeHtml } from '../core/security.js';

/** @type {HTMLElement | null} */
let modalRoot = null;

function ensureRoot() {
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.id = 'app-modal-root';
    modalRoot.className = 'fixed inset-0 z-[100] hidden items-center justify-center p-4';
    modalRoot.innerHTML = `
      <div class="absolute inset-0 bg-space-void/80 backdrop-blur-sm" data-modal-backdrop></div>
      <div class="relative z-10 w-full max-w-lg rounded-xl border border-pulse-violet/30 bg-nebula-deep shadow-[0_0_40px_rgba(124,58,237,0.2)]" role="dialog" aria-modal="true">
        <div class="border-b border-pulse-violet/20 px-6 py-4">
          <h2 id="modal-title" class="font-display text-lg text-neural-glow"></h2>
        </div>
        <div id="modal-body" class="px-6 py-4"></div>
        <div id="modal-footer" class="flex flex-wrap justify-end gap-2 border-t border-pulse-violet/20 px-6 py-4"></div>
      </div>
    `;
    document.body.appendChild(modalRoot);

    modalRoot.querySelector('[data-modal-backdrop]')?.addEventListener('click', () => closeModal());
  }
  return modalRoot;
}

/** Закриває модальне вікно. */
export function closeModal() {
  if (modalRoot) {
    modalRoot.classList.add('hidden');
    modalRoot.classList.remove('flex');
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-footer').innerHTML = '';
  }
}

/**
 * @param {{ title: string, bodyHtml: string, buttons?: Array<{ label: string, primary?: boolean, onClick?: () => void | Promise<void> }> }} options
 */
export function showModal(options) {
  const root = ensureRoot();
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const footerEl = document.getElementById('modal-footer');

  if (!titleEl || !bodyEl || !footerEl) {
    return;
  }

  titleEl.textContent = options.title;
  bodyEl.innerHTML = options.bodyHtml;
  footerEl.innerHTML = '';

  (options.buttons ?? [{ label: 'Закрити', onClick: closeModal }]).forEach((btn) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = btn.label;
    button.className = btn.primary
      ? 'rounded-lg bg-pulse-violet px-4 py-2 text-sm font-medium hover:shadow-[0_0_16px_rgba(124,58,237,0.4)]'
      : 'rounded-lg border border-pulse-violet/30 px-4 py-2 text-sm text-dim-text hover:border-neural-glow hover:text-neural-glow';
    button.addEventListener('click', async () => {
      if (btn.onClick) {
        await btn.onClick();
      } else {
        closeModal();
      }
    });
    footerEl.appendChild(button);
  });

  root.classList.remove('hidden');
  root.classList.add('flex');
}

/**
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function confirmModal(message) {
  return new Promise((resolve) => {
    showModal({
      title: 'Підтвердження',
      bodyHtml: `<p class="text-sm text-dim-text">${escapeHtml(message)}</p>`,
      buttons: [
        { label: 'Скасувати', onClick: () => { closeModal(); resolve(false); } },
        { label: 'Підтвердити', primary: true, onClick: () => { closeModal(); resolve(true); } },
      ],
    });
  });
}

export default { showModal, closeModal, confirmModal };
