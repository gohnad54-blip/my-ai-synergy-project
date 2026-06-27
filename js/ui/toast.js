/** Toast notifications */

/** @type {HTMLElement | null} */
let container = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-4 right-4 z-[110] flex flex-col gap-2';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * @param {string} message
 * @param {'success' | 'error' | 'info'} [type='success']
 */
export function showToast(message, type = 'success') {
  const root = ensureContainer();
  const toast = document.createElement('div');

  const colors = {
    success: 'border-success/40 bg-success/10 text-success',
    error: 'border-danger/40 bg-danger/10 text-red-300',
    info: 'border-synapse-blue/40 bg-synapse-blue/10 text-synapse-blue',
  };

  toast.className = `rounded-lg border px-4 py-3 text-sm shadow-lg ${colors[type] ?? colors.info}`;
  toast.textContent = message;
  root.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

export default { showToast };
