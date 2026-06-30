/**
 * Comprehensive i18n test — UA / EN / DE integration, regression, edge cases.
 */
import puppeteer from 'puppeteer-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3456';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'scripts', 'output');

/** @type {Record<string, unknown>} */
const report = {
  base: BASE,
  checkedAt: new Date().toISOString(),
  integration: {},
  regression: {},
  edgeCases: {},
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

/**
 * @param {import('puppeteer-core').Page} page
 * @param {string} path
 */
async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200));
}

/**
 * @param {import('puppeteer-core').Page} page
 */
async function getSwitcherInfo(page) {
  return page.evaluate(() => {
    const langs = [...document.querySelectorAll('[data-lang]')].map((el) => el.getAttribute('data-lang'));
    return { uniqueLangs: [...new Set(langs)] };
  });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const uk = JSON.parse(await readFile(join(process.cwd(), 'locales', 'uk.json'), 'utf8'));
  const en = JSON.parse(await readFile(join(process.cwd(), 'locales', 'en.json'), 'utf8'));
  const de = JSON.parse(await readFile(join(process.cwd(), 'locales', 'de.json'), 'utf8'));
  const ukKeys = Object.keys(uk).sort();
  const enKeys = Object.keys(en).sort();
  const deKeys = Object.keys(de).sort();
  report.keyParity = {
    ukCount: ukKeys.length,
    enCount: enKeys.length,
    deCount: deKeys.length,
    missingInDe: ukKeys.filter((k) => !deKeys.includes(k)),
    missingInEn: ukKeys.filter((k) => !enKeys.includes(k)),
    ok: deKeys.length === ukKeys.length && enKeys.length === ukKeys.length,
  };

  const publicPaths = ['/', '/materials', '/about', '/apply', '/login'];
  /** @type {Record<string, unknown>} */
  const publicResults = {};

  for (const path of publicPaths) {
    await goto(page, path);
    const sw = await getSwitcherInfo(page);
    publicResults[path] = {
      switcherLangs: sw.uniqueLangs,
      hasAllThree: ['uk', 'en', 'de'].every((l) => sw.uniqueLangs.includes(l)),
    };
  }
  report.integration.publicPages = publicResults;

  await goto(page, '/setup');
  const setupSw = await getSwitcherInfo(page);
  report.integration.setup = {
    path: await page.evaluate(() => location.pathname),
    switcherLangs: setupSw.uniqueLangs,
    hasAllThree: ['uk', 'en', 'de'].every((l) => setupSw.uniqueLangs.includes(l)),
  };

  await page.evaluate(() => {
    localStorage.setItem('ai-synergy-session', JSON.stringify({
      userId: 'i18n-test',
      role: 'admin',
      permissions: ['*'],
      expiresAt: Date.now() + 3600000,
      token: 'test-token',
      displayName: 'Test Admin',
    }));
  });
  await goto(page, '/dashboard');
  const dashSw = await getSwitcherInfo(page);
  report.integration.dashboard = {
    switcherLangs: dashSw.uniqueLangs,
    hasAllThree: ['uk', 'en', 'de'].every((l) => dashSw.uniqueLangs.includes(l)),
    welcomeDe: null,
  };

  await page.click('[data-lang="de"]');
  await new Promise((r) => setTimeout(r, 2000));
  report.integration.dashboard.welcomeDe = await page.$eval('[data-i18n="dashboard.welcome"]', (el) => el.textContent?.trim()).catch(() => null);

  await page.evaluate(() => localStorage.removeItem('locale'));
  await goto(page, '/');
  const ukHome = await page.$eval('[data-i18n="nav.home"]', (el) => el.textContent?.trim());
  await page.click('[data-lang="en"]');
  await new Promise((r) => setTimeout(r, 2000));
  const enHome = await page.$eval('[data-i18n="nav.home"]', (el) => el.textContent?.trim());
  const enLocale = await page.evaluate(() => localStorage.getItem('locale'));
  await page.click('[data-lang="uk"]');
  await new Promise((r) => setTimeout(r, 2000));
  const ukAgain = await page.$eval('[data-i18n="nav.home"]', (el) => el.textContent?.trim());

  report.regression = {
    ukHome,
    enHome,
    ukAgain,
    enLocale,
    ok: ukHome === 'Головна' && enHome === 'Home' && ukAgain === 'Головна' && enLocale === 'en',
  };

  await goto(page, '/materials');
  await page.click('[data-lang="en"]');
  await new Promise((r) => setTimeout(r, 1500));
  report.regression.catalogTitleEn = await page.$eval('[data-i18n="catalog.title"]', (el) => el.textContent?.trim());

  await goto(page, '/about');
  await page.click('[data-lang="de"]');
  await new Promise((r) => setTimeout(r, 2000));
  const deAboutBefore = await page.$eval('[data-i18n="about.title"]', (el) => el.textContent?.trim());
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));
  const deAboutAfter = await page.$eval('[data-i18n="about.title"]', (el) => el.textContent?.trim());
  const localeAfterReload = await page.evaluate(() => localStorage.getItem('locale'));
  const htmlLang = await page.evaluate(() => document.documentElement.lang);

  report.edgeCases.f5Persistence = {
    deAboutBefore,
    deAboutAfter,
    localeAfterReload,
    htmlLang,
    ok: deAboutBefore === 'Über AI Synergy' && deAboutAfter === deAboutBefore && localeAfterReload === 'de' && htmlLang === 'de',
  };

  await goto(page, '/apply');
  await page.click('[data-lang="de"]');
  await new Promise((r) => setTimeout(r, 1500));
  await page.type('#apply-name', 'Max Mustermann');
  await page.type('#apply-email', 'max@example.com');
  await page.type('#apply-reason', 'Ich möchte beitreten weil...');
  await page.click('[data-lang="uk"]');
  await new Promise((r) => setTimeout(r, 2500));
  const formValues = await page.evaluate(() => ({
    name: document.querySelector('#apply-name')?.value ?? '',
    email: document.querySelector('#apply-email')?.value ?? '',
    reason: document.querySelector('#apply-reason')?.value ?? '',
    title: document.querySelector('[data-i18n="apply.title"]')?.textContent?.trim() ?? '',
  }));
  report.edgeCases.formPreservation = {
    formValues,
    ok: formValues.name === 'Max Mustermann'
      && formValues.email === 'max@example.com'
      && formValues.reason === 'Ich möchte beitreten weil...'
      && formValues.title === 'Подати заявку',
  };

  const partialDe = { ...de };
  delete partialDe['nav.apply'];
  const simulatedFallback = partialDe['nav.apply'] ?? uk['nav.apply'];
  report.edgeCases.fallback = {
    simulatedMissingKey: 'nav.apply',
    deValue: de['nav.apply'],
    ukFallback: uk['nav.apply'],
    resolved: simulatedFallback,
    ok: simulatedFallback === 'Подати заявку',
  };

  const runtimeFallback = await page.evaluate(async () => {
    const mod = await import('/js/core/i18n.js');
    await mod.setLocale('de');
    return {
      navHome: mod.t('nav.home'),
      settings: mod.t('dashboard.settings'),
      ok: mod.t('nav.home') === 'Startseite' && mod.t('dashboard.settings') === 'Einstellungen',
    };
  });
  report.edgeCases.runtimeDe = runtimeFallback;

  await goto(page, '/');
  await page.click('[data-lang="de"]');
  await new Promise((r) => setTimeout(r, 2000));
  const layout = await page.evaluate(() => {
    const nav = document.querySelector('header nav');
    const applyLink = document.querySelector('[data-i18n="nav.apply"]');
    const cta = document.querySelector('[data-i18n="home.hero.cta"]');
    const switcher = document.querySelector('.lang-switcher');
    /** @param {Element | null | undefined} el */
    const overflow = (el) => {
      if (!(el instanceof HTMLElement)) {
        return null;
      }
      return el.scrollWidth > el.clientWidth + 2;
    };
    return {
      applyText: applyLink?.textContent?.trim() ?? '',
      navOverflow: overflow(nav),
      applyOverflow: overflow(applyLink),
      ctaOverflow: overflow(cta),
      switcherVisible: switcher instanceof HTMLElement && switcher.offsetWidth > 0,
    };
  });
  report.edgeCases.layout = {
    ...layout,
    ok: layout.applyText === 'Mitgliedschaft beantragen' && layout.navOverflow === false && layout.switcherVisible === true,
  };

  report.integration.ok = Object.values(publicResults).every((r) => r.hasAllThree)
    && report.integration.setup.hasAllThree
    && report.integration.dashboard.hasAllThree
    && report.integration.dashboard.welcomeDe === 'Willkommen';

  report.regression.ok = report.regression.ok
    && report.regression.catalogTitleEn === 'Materials catalog';

  report.edgeCases.ok = report.edgeCases.f5Persistence.ok
    && report.edgeCases.formPreservation.ok
    && report.edgeCases.fallback.ok
    && report.edgeCases.runtimeDe.ok
    && report.edgeCases.layout.ok;

  report.allOk = report.keyParity.ok
    && report.integration.ok
    && report.regression.ok
    && report.edgeCases.ok;

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'i18n-de-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!report.allOk) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('TEST FAILED:', error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
