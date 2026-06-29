/**
 * Puppeteer test: upload JPG to group chat, inspect DB row + DOM render.
 *
 * Usage:
 *   node scripts/test-chat-image-upload.mjs
 *   BASE_URL=https://ai-synergy-archive.netlify.app LOGIN=admin PASSWORD=... node scripts/test-chat-image-upload.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.BASE_URL ?? 'http://localhost:3456';
const LOGIN = process.env.LOGIN ?? 'playwright';
const PASSWORD = process.env.PASSWORD ?? 'password123';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'scripts', 'output');
const SUPABASE_URL = 'https://zvzeiduvzrmfnltzfafl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2emVpZHV2enJtZm5sdHpmYWZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1Nzk0ODUsImV4cCI6MjA5ODE1NTQ4NX0.SZx5rLPZMBrizNfRY7ABxJqCtY5byndL4ixThxx3Lqc';

/** Minimal valid JPEG */
const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==',
  'base64',
);

const TEST_JPG = join(OUT, 'chat-test-photo.jpg');

await mkdir(OUT, { recursive: true });
await writeFile(TEST_JPG, JPEG_BYTES);

const debugLogs = [];
const apiCaptures = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

/**
 * @param {import('puppeteer-core').Page} page
 */
async function ensureLoggedIn(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => document.getElementById('app')?.innerHTML.trim().length > 50,
    { timeout: 30000 },
  );

  const path = new URL(page.url()).pathname;
  if (path.includes('/setup')) {
    await page.waitForSelector('#setup-login', { timeout: 15000 });
    await page.type('#setup-login', LOGIN);
    await page.type('#setup-display-name', 'Puppeteer Admin');
    await page.type('#setup-password', PASSWORD);
    await page.type('#setup-password-confirm', PASSWORD);
    await page.click('#setup-submit');
    await page.waitForFunction(() => location.pathname.includes('/dashboard'), { timeout: 30000 });
    return;
  }

  if (path.includes('/login')) {
    await page.waitForSelector('#login', { timeout: 15000 });
    await page.type('#login', LOGIN);
    await page.type('#password', PASSWORD);
    await page.click('#login-submit');
    await page.waitForFunction(() => location.pathname.includes('/dashboard'), { timeout: 30000 });
    return;
  }

  if (!path.includes('/dashboard')) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#login', { timeout: 15000 });
    await page.type('#login', LOGIN);
    await page.type('#password', PASSWORD);
    await page.click('#login-submit');
    await page.waitForFunction(() => location.pathname.includes('/dashboard'), { timeout: 30000 });
  }
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[chat-attach-debug]')) {
      debugLogs.push(text);
      console.log('browser:', text);
    }
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('supabase.co/rest/v1/')) {
      return;
    }
    const method = res.request().method();
    if (method === 'POST' && (url.includes('group_messages') || url.includes('private_messages'))) {
      try {
        const body = res.request().postData();
        apiCaptures.push({ kind: 'insert', url, status: res.status(), body });
      } catch { /* ignore */ }
    }
    if (method === 'GET' && (url.includes('group_messages') || url.includes('private_messages'))) {
      try {
        const json = await res.json();
        apiCaptures.push({ kind: 'select', url, status: res.status(), rows: json });
      } catch { /* ignore */ }
    }
  });

  await ensureLoggedIn(page);
  await page.goto(`${BASE}/dashboard/chat?tab=group`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#chat-compose-form', { timeout: 30000 });

  const fileInput = await page.$('#chat-file-input');
  if (!fileInput) {
    throw new Error('#chat-file-input not found');
  }
  await fileInput.uploadFile(TEST_JPG);
  await new Promise((r) => setTimeout(r, 800));

  await page.click('#chat-compose-form button[type="submit"]');
  await page.waitForFunction(() => {
    const messages = document.getElementById('chat-messages');
    const last = messages?.querySelector('[data-msg-id]:last-child');
    return Boolean(last?.querySelector('img[src], a[download], [data-chat-image-open]'));
  }, { timeout: 20000 });

  const domState = await page.evaluate(() => {
    const messages = document.getElementById('chat-messages');
    const lastMsg = messages?.querySelector('[data-msg-id]:last-child');
    return {
      imgCount: messages?.querySelectorAll('img[src]').length ?? 0,
      fileCardCount: messages?.querySelectorAll('a[download]').length ?? 0,
      lastMsgHtml: lastMsg?.innerHTML?.slice(0, 1000) ?? '',
      hasImagePreview: Boolean(lastMsg?.querySelector('img[src]')),
      hasFileCard: Boolean(lastMsg?.querySelector('a[download]')),
      hasDataChatImage: Boolean(lastMsg?.querySelector('[data-chat-image-open]')),
    };
  });

  const sessionToken = await page.evaluate(() => {
    const raw = localStorage.getItem('ai-synergy-session') ?? sessionStorage.getItem('ai-synergy-session');
    if (!raw) return null;
    try {
      return JSON.parse(raw).token ?? null;
    } catch {
      return null;
    }
  });

  let dbRows = null;
  if (sessionToken) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { 'x-app-session': sessionToken } },
    });
    const { data, error } = await supabase
      .from('group_messages')
      .select('id, attachment_type, attachment_name, attachment_url, attachment_size, created_at')
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) {
      console.error('DB query error:', error.message);
    } else {
      dbRows = data;
    }
  }

  const screenshotPath = join(OUT, 'chat-image-upload-test.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const insertCapture = apiCaptures.find((c) => c.kind === 'insert');
  const result = {
    ok: domState.hasImagePreview && !domState.hasFileCard,
    baseUrl: BASE,
    domState,
    debugLogs,
    insertBody: insertCapture?.body ?? null,
    dbRows,
    screenshotPath,
  };

  await writeFile(join(OUT, 'chat-image-upload-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('TEST FAILED:', error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
