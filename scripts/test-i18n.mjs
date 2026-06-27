import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3456';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'scripts', 'output');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  const path = await page.evaluate(() => location.pathname);
  const key = path === '/setup' ? 'setup.welcome' : 'nav.home';

  const ukText = await page.$eval(`[data-i18n="${key}"]`, (el) => el.textContent?.trim());
  await page.click('[data-lang="en"]');
  await new Promise((r) => setTimeout(r, 2500));

  const enText = await page.$eval(`[data-i18n="${key}"]`, (el) => el.textContent?.trim());
  const locale = await page.evaluate(() => localStorage.getItem('locale'));
  const hasSwitcher = await page.$('[data-lang="uk"]') !== null;

  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, 'i18n-en.png') });

  const expected = key === 'setup.welcome'
    ? { uk: 'Ласкаво просимо до налаштування архіву', en: 'Welcome to archive setup' }
    : { uk: 'Головна', en: 'Home' };

  const result = {
    path,
    key,
    ukText,
    enText,
    locale,
    hasSwitcher,
    ok: ukText === expected.uk && enText === expected.en && locale === 'en' && hasSwitcher,
  };
  console.log(JSON.stringify(result, null, 2));
  await writeFile(join(OUT, 'i18n-test.json'), JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('TEST FAILED:', error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
