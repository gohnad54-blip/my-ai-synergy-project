/**
 * Browser test (no login): verify attachment type resolution + image render branch in Chromium.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3456';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'scripts', 'output');

const TINY_JPEG_DATA_URI = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==';

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 900, height: 700 });
  await page.goto(`${BASE}/login?v=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const result = await page.evaluate(async (dataUri) => {
    const mod = await import('/js/modules/chat-attachments.js');

    const scenarios = [
      {
        label: 'file-in-db-name-without-ext-path-has-jpg',
        msg: { attachmentType: 'file', attachmentName: 'IMG_1234', attachmentUrl: 'group/gmsg_test/IMG_1234.jpg' },
      },
      {
        label: 'snake-case-image-type',
        msg: { attachment_type: 'image', attachment_name: 'photo.jpg', attachment_url: 'private/u/m/photo.jpg' },
      },
      {
        label: 'plain-jpg',
        msg: { attachmentType: 'image', attachmentName: 'chat-test-photo.jpg', attachmentUrl: 'group/gmsg_x/chat-test-photo.jpg' },
      },
    ];

    const resolved = scenarios.map(({ label, msg }) => ({
      label,
      type: mod.resolveDisplayAttachmentType(msg),
      isStorage: mod.isStorageAttachment(msg),
    }));

    const buggy = scenarios[0].msg;
    const type = mod.resolveDisplayAttachmentType(buggy);
    const root = document.createElement('div');
    root.id = 'fixture-root';
    root.style.cssText = 'padding:16px;background:#111;color:#fff;font-family:sans-serif';

    if (type === 'image') {
      root.innerHTML = `
        <p>Resolved type: image (was attachmentType=file, name without extension)</p>
        <button type="button" data-chat-image-full="${dataUri}" style="display:block;border:1px solid #7c3aed;border-radius:8px;overflow:hidden;max-width:320px;padding:0;background:#0003">
          <img src="${dataUri}" alt="test" style="display:block;max-height:320px;max-width:320px;object-fit:contain">
        </button>`;
    } else {
      root.innerHTML = `<p>FAIL: resolved type = ${type}</p><a download>file card</a>`;
    }

    document.body.innerHTML = '';
    document.body.appendChild(root);

    return {
      resolved,
      renderedImage: Boolean(document.querySelector('#fixture-root img[src]')),
      renderedFileCard: Boolean(document.querySelector('#fixture-root a[download]')),
    };
  }, TINY_JPEG_DATA_URI);

  const screenshotPath = join(OUT, 'chat-image-render-fixture.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const payload = { ok: result.renderedImage && !result.renderedFileCard, ...result, screenshotPath };
  await writeFile(join(OUT, 'chat-render-fixture-result.json'), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));

  if (!payload.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('TEST FAILED:', error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
