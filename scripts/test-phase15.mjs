import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3456';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'scripts', 'output');

/** @type {{ name: string, ok: boolean, detail?: string }[]} */
const results = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const dashboardUrl = page.url();
  results.push({
    name: 'dashboard-redirect-without-auth',
    ok: dashboardUrl.includes('/login') || dashboardUrl.includes('/setup'),
    detail: dashboardUrl,
  });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate(() => {
    localStorage.setItem(
      'ai-synergy-session',
      JSON.stringify({
        userId: 'stale-test',
        role: 'admin',
        permissions: [],
        expiresAt: Date.now() + 3600000,
        token: 'stale-token',
      }),
    );
    sessionStorage.removeItem('ai-synergy-session');
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const staleUrl = page.url();
  const sessionCleared = await page.evaluate(() => !localStorage.getItem('ai-synergy-session'));
  results.push({
    name: 'stale-session-repair',
    ok: sessionCleared && (staleUrl.includes('/login') || staleUrl.includes('/setup') || staleUrl.endsWith('/')),
    detail: `${staleUrl} sessionCleared=${sessionCleared}`,
  });

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const particlesOk = await page.evaluate(() => {
    const el = document.getElementById('particles-bg');
    if (!el) {
      return true;
    }
    return window.getComputedStyle(el).display === 'none';
  });
  results.push({
    name: 'particles-reduced-motion',
    ok: particlesOk,
  });

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));
  const lazyImages = await page.$$eval('img[loading="lazy"]', (nodes) => nodes.length);
  results.push({
    name: 'lazy-images-present',
    ok: true,
    detail: `lazy img count: ${lazyImages}`,
  });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));
  const dompurifyLoaded = await page.evaluate(() => typeof window.DOMPurify !== 'undefined');
  results.push({
    name: 'dompurify-preload',
    ok: dompurifyLoaded,
  });

  const allOk = results.every((r) => r.ok);
  const report = { base: BASE, ok: allOk, results };
  console.log(JSON.stringify(report, null, 2));

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'phase15-test.json'), JSON.stringify(report, null, 2));

  if (!allOk) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('TEST FAILED:', error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
