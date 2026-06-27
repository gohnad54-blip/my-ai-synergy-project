import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3456';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'scripts', 'output');

const logs = [];
const network = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  page.on('response', (res) => {
    const url = res.url();
    if (/tsparticles|jsdelivr.*particle/i.test(url)) {
      network.push({ url, status: res.status(), ok: res.ok() });
    }
  });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));

  await page.mouse.move(400, 300);
  await new Promise((r) => setTimeout(r, 500));
  await page.mouse.move(200, 150);
  await new Promise((r) => setTimeout(r, 500));

  const hoverInfo = await page.evaluate(() => {
    const container = document.getElementById('particles-bg');
    const canvas = container?.querySelector('canvas');
    return {
      interactivityEnabled: Boolean(window.tsParticles?.dom()?.[0]?.options?.interactivity?.events?.onHover?.enable),
      hoverMode: window.tsParticles?.dom()?.[0]?.options?.interactivity?.events?.onHover?.mode ?? null,
      canvasStillPresent: Boolean(canvas),
    };
  });

  const info = await page.evaluate(() => {
    const container = document.getElementById('particles-bg');
    const canvas = container?.querySelector('canvas');
    return {
      hasTsParticles: typeof window.tsParticles !== 'undefined',
      hasLoadAll: typeof window.loadAll === 'function',
      tsParticlesKeys: window.tsParticles ? Object.keys(window.tsParticles).slice(0, 15) : [],
      containerChildren: container?.childElementCount ?? 0,
      hasCanvas: Boolean(canvas),
      canvasSize: canvas ? { w: canvas.width, h: canvas.height } : null,
    };
  });

  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, 'particles-home.png'), fullPage: true });

  const result = {
    base: BASE,
    info,
    hoverInfo,
    network,
    particleLogs: logs.filter((l) => /particle|Particle|tsparticles|loadAll/i.test(l)),
    errors: logs.filter((l) => l.includes('error') || l.includes('failed') || l.includes('pageerror')),
  };
  console.log(JSON.stringify(result, null, 2));
  await writeFile(join(OUT, 'particles-test.json'), JSON.stringify({ ...result, allLogs: logs }, null, 2));

  if (!info.hasCanvas) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('TEST FAILED:', error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
