/** Material editor — Quill CMS, media, autosave */

import { getSession, hasPermission } from '../../core/auth.js';
import db from '../../core/db.js';
import {
  createMaterial,
  getMaterial,
  isValidUrl,
  updateMaterial,
} from '../../modules/materials.js';
import { generateId } from '../../core/crypto.js';
import { showToast } from '../../ui/toast.js';

const IMAGE_MAX = 5;
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const PDF_MAX_BYTES = 20 * 1024 * 1024;
const AUTOSAVE_MS = 60_000;

/** @type {import('quill').default | null} */
let quill = null;
/** @type {string | null} */
let materialId = null;
/** @type {string[]} */
let tags = [];
/** @type {object[]} */
let images = [];
/** @type {object[]} */
let videos = [];
/** @type {object[]} */
let links = [];
/** @type {object | null} */
let pdfData = null;
/** @type {number | null} */
let autosaveTimer = null;

/**
 * @param {string} href
 * @param {string} id
 * @returns {Promise<void>}
 */
function loadStylesheet(href, id) {
  if (document.getElementById(id)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = reject;
    document.head.appendChild(link);
  });
}

/**
 * @param {string} src
 * @returns {Promise<void>}
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadEditorAssets() {
  await loadStylesheet('https://cdn.jsdelivr.net/npm/quill@2/dist/quill.snow.css', 'quill-css');
  await loadScript('https://cdn.jsdelivr.net/npm/quill@2/dist/quill.js');
  await loadScript('https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js');
}

/**
 * @returns {string}
 */
function draftKey() {
  return `ai-synergy-draft-${materialId ?? 'new'}`;
}

function initQuillEditor() {
  const container = document.getElementById('quill-editor');
  if (!container || !window.Quill) {
    return;
  }

  quill = new window.Quill(container, {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['code-block', 'link', 'blockquote'],
      ],
    },
  });
}

/**
 * @param {string} msg
 */
function showError(msg) {
  const el = document.getElementById('mat-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function hideError() {
  document.getElementById('mat-error')?.classList.add('hidden');
}

function renderTags() {
  const list = document.getElementById('tags-list');
  if (!list) {
    return;
  }
  list.innerHTML = tags.map((tag, i) => `
    <span class="inline-flex items-center gap-1 rounded-full bg-pulse-violet/25 px-3 py-1 text-sm">
      ${escapeHtml(tag)}
      <button type="button" data-tag-index="${i}" class="text-dim-text hover:text-red-400" aria-label="Видалити">×</button>
    </span>
  `).join('');

  list.querySelectorAll('[data-tag-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tags.splice(Number(btn.getAttribute('data-tag-index')), 1);
      renderTags();
    });
  });
}

function renderImages() {
  const preview = document.getElementById('images-preview');
  if (!preview) {
    return;
  }
  preview.innerHTML = images.map((img, i) => `
    <div class="relative overflow-hidden rounded-lg border border-pulse-violet/20">
      <img src="${img.data}" alt="${escapeHtml(img.name)}" class="h-24 w-full object-cover" loading="lazy">
      <button type="button" data-img-index="${i}"
        class="absolute right-1 top-1 rounded bg-space-void/80 px-1.5 text-sm text-red-400 hover:bg-red-500/20">×</button>
    </div>
  `).join('');

  preview.querySelectorAll('[data-img-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      images.splice(Number(btn.getAttribute('data-img-index')), 1);
      renderImages();
    });
  });
}

/**
 * @param {string} url
 */
function detectVideoPlatform(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host.includes('youtube.com') || host === 'youtu.be') {
    return 'youtube';
  }
  if (host.includes('vimeo.com')) {
    return 'vimeo';
  }
  if (host.includes('tiktok.com')) {
    return 'tiktok';
  }
  if (host === 't.me') {
    return 'telegram';
  }
  if (host.includes('loom.com')) {
    return 'loom';
  }
  return 'other';
}

/**
 * @param {string} url
 * @param {string} platform
 */
function getEmbedPreview(url, platform) {
  try {
    if (platform === 'youtube') {
      const u = new URL(url);
      const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
      if (id) {
        return `<iframe class="aspect-video w-full max-w-md rounded-lg" src="https://www.youtube-nocookie.com/embed/${id}" allowfullscreen loading="lazy"></iframe>`;
      }
    }
    if (platform === 'vimeo') {
      const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
      if (id) {
        return `<iframe class="aspect-video w-full max-w-md rounded-lg" src="https://player.vimeo.com/video/${id}" allowfullscreen loading="lazy"></iframe>`;
      }
    }
  } catch {
    return '';
  }
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="text-synapse-blue text-sm break-all">${escapeHtml(url)}</a>`;
}

function renderVideos() {
  const list = document.getElementById('videos-list');
  if (!list) {
    return;
  }
  list.innerHTML = videos.map((v, i) => `
    <div class="rounded-lg border border-pulse-violet/20 p-3">
      <div class="mb-2 flex justify-between gap-2">
        <span class="text-xs uppercase text-dim-text">${escapeHtml(v.platform)}</span>
        <button type="button" data-vid-index="${i}" class="text-red-400 hover:underline text-sm">×</button>
      </div>
      ${getEmbedPreview(v.url, v.platform)}
    </div>
  `).join('');

  list.querySelectorAll('[data-vid-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      videos.splice(Number(btn.getAttribute('data-vid-index')), 1);
      renderVideos();
    });
  });
}

function renderLinks() {
  const list = document.getElementById('links-list');
  if (!list) {
    return;
  }
  list.innerHTML = links.map((link, i) => `
    <li class="flex items-center justify-between gap-2 rounded-lg border border-pulse-violet/20 px-3 py-2 text-sm">
      <span><strong>${escapeHtml(link.label || link.url)}</strong> — <span class="text-dim-text break-all">${escapeHtml(link.url)}</span></span>
      <button type="button" data-link-index="${i}" class="shrink-0 text-red-400">×</button>
    </li>
  `).join('');

  list.querySelectorAll('[data-link-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      links.splice(Number(btn.getAttribute('data-link-index')), 1);
      renderLinks();
    });
  });
}

function updatePdfUi() {
  const nameEl = document.getElementById('pdf-file-name');
  if (!nameEl) {
    return;
  }
  if (pdfData?.type === 'file') {
    nameEl.textContent = pdfData.name ? `📄 ${pdfData.name}` : '';
  } else if (pdfData?.type === 'url') {
    nameEl.textContent = pdfData.url ? `🔗 ${pdfData.url}` : '';
  } else {
    nameEl.textContent = '';
  }
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * @param {FileList | File[]} files
 */
async function handleImageFiles(files) {
  for (const file of files) {
    if (images.length >= IMAGE_MAX) {
      showToast(`Максимум ${IMAGE_MAX} зображень`, 'error');
      break;
    }
    if (!file.type.startsWith('image/')) {
      continue;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      showToast(`${file.name}: більше 2MB`, 'error');
      continue;
    }
    const data = await readFileAsDataUrl(file);
    images.push({
      id: generateId('img'),
      name: file.name,
      data,
      mimeType: file.type,
      size: file.size,
    });
  }
  renderImages();
}

/**
 * @param {File} file
 */
async function handlePdfFile(file) {
  if (file.type !== 'application/pdf') {
    showToast('Лише PDF файли', 'error');
    return;
  }
  if (file.size > PDF_MAX_BYTES) {
    showToast('PDF більше 20MB', 'error');
    return;
  }
  const data = await readFileAsDataUrl(file);
  pdfData = { type: 'file', name: file.name, data, size: file.size };
  updatePdfUi();
}

function collectFormData() {
  const specificUsers = [.../** @type {HTMLSelectElement} */ (document.getElementById('vis-users')).selectedOptions]
    .map((o) => o.value);

  return {
    title: /** @type {HTMLInputElement} */ (document.getElementById('mat-title')).value,
    description: /** @type {HTMLTextAreaElement} */ (document.getElementById('mat-description')).value,
    categoryId: /** @type {HTMLSelectElement} */ (document.getElementById('mat-category')).value || null,
    status: /** @type {HTMLSelectElement} */ (document.getElementById('mat-status')).value,
    tags: [...tags],
    contentHtml: quill?.root.innerHTML ?? '',
    media: { images, videos, pdf: pdfData, links },
    visibility: {
      guestAccess: /** @type {HTMLInputElement} */ (document.getElementById('vis-guest')).checked,
      allAuthenticated: /** @type {HTMLInputElement} */ (document.getElementById('vis-auth')).checked,
      specificUsers,
    },
    commentsAccess: /** @type {HTMLSelectElement} */ (document.getElementById('mat-comments-access')).value,
  };
}

/**
 * @param {object} data
 */
function applyFormData(data) {
  /** @type {HTMLInputElement} */ (document.getElementById('mat-title')).value = data.title ?? '';
  /** @type {HTMLTextAreaElement} */ (document.getElementById('mat-description')).value = data.description ?? '';
  /** @type {HTMLSelectElement} */ (document.getElementById('mat-category')).value = data.categoryId ?? '';
  /** @type {HTMLSelectElement} */ (document.getElementById('mat-status')).value = data.status ?? 'draft';
  tags = data.tags ?? [];
  images = data.media?.images ?? [];
  videos = data.media?.videos ?? [];
  links = data.media?.links ?? [];
  pdfData = data.media?.pdf ?? null;

  if (quill && data.contentHtml) {
    quill.root.innerHTML = data.contentHtml;
  }

  /** @type {HTMLInputElement} */ (document.getElementById('vis-guest')).checked = Boolean(data.visibility?.guestAccess);
  /** @type {HTMLInputElement} */ (document.getElementById('vis-auth')).checked = Boolean(data.visibility?.allAuthenticated);

  const visSelect = /** @type {HTMLSelectElement} */ (document.getElementById('vis-users'));
  const selected = new Set(data.visibility?.specificUsers ?? []);
  [...visSelect.options].forEach((opt) => {
    opt.selected = selected.has(opt.value);
  });

  const commentsAccess = ['all', 'authenticated', 'disabled'].includes(data.commentsAccess)
    ? data.commentsAccess
    : 'disabled';
  /** @type {HTMLSelectElement} */ (document.getElementById('mat-comments-access')).value = commentsAccess;

  renderTags();
  renderImages();
  renderVideos();
  renderLinks();
  updatePdfUi();
  updateDescCount();
}

function saveLocalDraft() {
  try {
    const payload = { ...collectFormData(), savedAt: Date.now() };
    localStorage.setItem(draftKey(), JSON.stringify(payload));
    const el = document.getElementById('mat-autosave');
    if (el) {
      el.textContent = `Чернетка збережена локально о ${new Date().toLocaleTimeString('uk-UA')}`;
    }
  } catch {
    showToast('Локальне автозбереження: перевищено ліміт сховища', 'error');
  }
}

function clearLocalDraft() {
  localStorage.removeItem(draftKey());
  localStorage.removeItem('ai-synergy-draft-new');
  if (materialId) {
    localStorage.removeItem(`ai-synergy-draft-${materialId}`);
  }
}

function updateDescCount() {
  const desc = /** @type {HTMLTextAreaElement} */ (document.getElementById('mat-description'));
  const count = document.getElementById('desc-count');
  if (count && desc) {
    count.textContent = String(desc.value.length);
  }
}

/**
 * @param {string} status
 */
async function persistMaterial(status) {
  hideError();
  const data = collectFormData();
  data.status = status;

  if (!data.title.trim()) {
    showError('Назва матеріалу обов\'язкова');
    return null;
  }

  if (status === 'published' && !hasPermission('content.publish')) {
    showError('Немає права на публікацію');
    return null;
  }

  let saved;
  if (materialId) {
    saved = await updateMaterial(materialId, data);
  } else {
    saved = await createMaterial(data);
    materialId = saved.id;
  }

  clearLocalDraft();
  showToast(status === 'published' ? 'Опубліковано' : 'Чернетку збережено');
  return saved;
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setupMediaTabs() {
  document.querySelectorAll('.media-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-media-tab');
      document.querySelectorAll('.media-tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.classList.toggle('text-dim-text', t !== tab);
        t.classList.toggle('bg-pulse-violet/20', t === tab);
      });
      document.querySelectorAll('.media-panel').forEach((p) => p.classList.add('hidden'));
      document.getElementById(`panel-${name}`)?.classList.remove('hidden');
    });
  });
  document.querySelector('.media-tab')?.classList.add('bg-pulse-violet/20');
}

function setupDropzone(zoneId, inputId, onFiles) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) {
    return;
  }

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer?.files) {
      onFiles(e.dataTransfer.files);
    }
  });
  input.addEventListener('change', () => {
    if (input.files) {
      onFiles(input.files);
      input.value = '';
    }
  });
}

/**
 * @param {{ params: Record<string, string>, navigate: Function }} ctx
 */
export default async function init(ctx) {
  materialId = ctx.params?.id ?? null;

  if (!hasPermission('content.publish')) {
    document.getElementById('btn-publish')?.classList.add('hidden');
  }

  if (!hasPermission('content.visibility')) {
    document.getElementById('visibility-section')?.classList.add('hidden');
  }

  await loadEditorAssets();
  initQuillEditor();

  const [categories, users] = await Promise.all([
    db.getAll('categories'),
    db.getAll('users'),
  ]);

  const catSelect = document.getElementById('mat-category');
  categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name ?? c.id;
    catSelect?.appendChild(opt);
  });

  const visSelect = document.getElementById('vis-users');
  users.filter((u) => u.status !== 'inactive').forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.displayName ?? u.login;
    visSelect?.appendChild(opt);
  });

  setupMediaTabs();
  setupDropzone('images-dropzone', 'images-input', handleImageFiles);
  setupDropzone('pdf-dropzone', 'pdf-input', (files) => {
    if (files[0]) {
      handlePdfFile(files[0]);
    }
  });

  document.getElementById('mat-description')?.addEventListener('input', updateDescCount);

  document.getElementById('tag-add-btn')?.addEventListener('click', addTag);
  document.getElementById('tag-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  });

  document.querySelectorAll('input[name="pdf-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const mode = /** @type {HTMLInputElement} */ (document.querySelector('input[name="pdf-mode"]:checked'))?.value;
      document.getElementById('pdf-file-panel')?.classList.toggle('hidden', mode === 'url');
      document.getElementById('pdf-url-panel')?.classList.toggle('hidden', mode !== 'url');
      if (mode === 'url') {
        pdfData = { type: 'url', url: '' };
      } else {
        pdfData = null;
      }
      updatePdfUi();
    });
  });

  document.getElementById('pdf-url')?.addEventListener('change', (e) => {
    const url = /** @type {HTMLInputElement} */ (e.target).value.trim();
    if (url && !isValidUrl(url)) {
      showToast('Невірний URL PDF', 'error');
      return;
    }
    pdfData = url ? { type: 'url', url } : null;
    updatePdfUi();
  });

  document.getElementById('video-add-btn')?.addEventListener('click', () => {
    const url = /** @type {HTMLInputElement} */ (document.getElementById('video-url')).value.trim();
    if (!isValidUrl(url)) {
      showToast('Невірний URL відео', 'error');
      return;
    }
    videos.push({ id: generateId('vid'), url, platform: detectVideoPlatform(url) });
    /** @type {HTMLInputElement} */ (document.getElementById('video-url')).value = '';
    renderVideos();
  });

  document.getElementById('link-add-btn')?.addEventListener('click', () => {
    const url = /** @type {HTMLInputElement} */ (document.getElementById('link-url')).value.trim();
    const label = /** @type {HTMLInputElement} */ (document.getElementById('link-label')).value.trim();
    if (!isValidUrl(url)) {
      showToast('Невірний URL', 'error');
      return;
    }
    links.push({ id: generateId('lnk'), url, label });
    /** @type {HTMLInputElement} */ (document.getElementById('link-url')).value = '';
    /** @type {HTMLInputElement} */ (document.getElementById('link-label')).value = '';
    renderLinks();
  });

  document.getElementById('btn-save-draft')?.addEventListener('click', async () => {
    try {
      const saved = await persistMaterial('draft');
      if (saved && !ctx.params?.id) {
        await ctx.navigate(`/dashboard/material-edit/${saved.id}`, true);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Помилка збереження');
    }
  });

  document.getElementById('btn-publish')?.addEventListener('click', async () => {
    try {
      const saved = await persistMaterial('published');
      if (saved && !ctx.params?.id) {
        await ctx.navigate(`/dashboard/material-edit/${saved.id}`, true);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Помилка публікації');
    }
  });

  if (materialId) {
    const material = await getMaterial(materialId);
    if (material) {
      applyFormData(material);
    }
  } else {
    const draftRaw = localStorage.getItem(draftKey());
    if (draftRaw) {
      try {
        applyFormData(JSON.parse(draftRaw));
        showToast('Відновлено локальну чернетку', 'info');
      } catch {
        /* ignore */
      }
    }
  }

  autosaveTimer = window.setInterval(saveLocalDraft, AUTOSAVE_MS);

  window.addEventListener('beforeunload', () => {
    if (autosaveTimer) {
      clearInterval(autosaveTimer);
    }
  }, { once: true });
}

function addTag() {
  const input = /** @type {HTMLInputElement} */ (document.getElementById('tag-input'));
  const value = input.value.trim().toLowerCase();
  if (!value || tags.includes(value)) {
    input.value = '';
    return;
  }
  tags.push(value);
  input.value = '';
  renderTags();
}
