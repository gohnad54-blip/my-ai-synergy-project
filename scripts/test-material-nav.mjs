import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:3456';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();

page.on('console', (msg) => {
  if (msg.text().includes('[router]')) {
    console.log('browser:', msg.text());
  }
});

const documentLoads = [];
page.on('response', (res) => {
  if (res.request().resourceType() === 'document') {
    documentLoads.push(res.url());
  }
});

async function waitForPath(pathPart, timeout = 20000) {
  await page.waitForFunction(
    (part) => location.pathname.includes(part),
    { timeout },
    pathPart,
  );
}

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => {
      const app = document.getElementById('app');
      return app && app.innerHTML.trim().length > 50;
    },
    { timeout: 30000 },
  );

  const path = new URL(page.url()).pathname;
  console.log('after initial load:', path);

  if (path.includes('/setup')) {
    await page.waitForSelector('#setup-login', { timeout: 15000 });
    await page.type('#setup-login', 'playwright');
    await page.type('#setup-display-name', 'Playwright Admin');
    await page.type('#setup-password', 'password123');
    await page.type('#setup-password-confirm', 'password123');
    await page.click('#setup-submit');
    await waitForPath('/dashboard');
  } else if (path.includes('/login')) {
    await page.waitForSelector('#login', { timeout: 15000 });
    await page.type('#login', 'playwright');
    await page.type('#password', 'password123');
    await page.click('#login-submit');
    await waitForPath('/dashboard');
  }

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('app:navigate', {
      detail: { path: '/dashboard/materials' },
    }));
  });
  await waitForPath('/dashboard/materials');

  console.log('on materials:', page.url());

  const docLoadsBefore = documentLoads.length;
  const createSelector = '[data-spa-nav="/dashboard/material-edit"], a[href="/dashboard/material-edit"]';
  await page.waitForSelector(createSelector, { timeout: 10000 });
  await page.click(createSelector);

  await page.waitForFunction(
    () => location.pathname === '/dashboard/material-edit',
    { timeout: 15000 },
  );
  await page.waitForSelector('.material-editor, #mat-title', { timeout: 15000 });

  const afterUrl = page.url();
  const bodyText = await page.evaluate(() => document.body.innerText);
  const has404 = bodyText.includes('The requested path could not be found');
  const hasEditor = await page.$('.material-editor, #mat-title') !== null;
  const fullReload = documentLoads.length > docLoadsBefore;

  const result = {
    ok: !has404 && hasEditor && afterUrl.includes('/dashboard/material-edit'),
    afterUrl,
    has404,
    hasEditor,
    fullPageDocumentReloadOnClick: fullReload,
    documentLoads,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('TEST FAILED:', error.message);
  console.error('URL at failure:', page.url());
  const snippet = await page.evaluate(() => document.body?.innerText?.slice(0, 400) ?? '');
  console.error('Body snippet:', snippet);
  process.exitCode = 1;
} finally {
  await browser.close();
}
