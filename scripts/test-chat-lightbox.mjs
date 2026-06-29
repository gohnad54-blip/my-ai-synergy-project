/**
 * Browser test: image lightbox opens blob URL from thumbnail src (not broken signed URL).
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
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const result = await page.evaluate(async (dataUri) => {
    const ui = await import('/js/ui/chat-attachments.js');

    document.body.innerHTML = `
      <div id="chat-messages">
        <button type="button" data-chat-image-open>
          <img src="${dataUri}" alt="test-photo.jpg">
        </button>
      </div>
    `;

    const container = document.getElementById('chat-messages');
    ui.bindChatImageLightbox(container);
    container.querySelector('[data-chat-image-open]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await new Promise((r) => setTimeout(r, 200));

    const lightbox = document.getElementById('chat-image-lightbox');
    const lightboxImg = lightbox?.querySelector('[data-lightbox-img]');
    const thumb = container.querySelector('img');

    return {
      lightboxVisible: lightbox && !lightbox.classList.contains('hidden'),
      lightboxSrc: lightboxImg instanceof HTMLImageElement ? lightboxImg.src : null,
      thumbSrc: thumb instanceof HTMLImageElement ? thumb.src : null,
      sameSrc: lightboxImg instanceof HTMLImageElement && thumb instanceof HTMLImageElement
        ? lightboxImg.src === thumb.src
        : false,
      lightboxLoads: lightboxImg instanceof HTMLImageElement ? lightboxImg.complete && lightboxImg.naturalWidth > 0 : false,
    };
  }, TINY_JPEG_DATA_URI);

  const screenshotPath = join(OUT, 'chat-lightbox-test.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const payload = {
    ok: result.lightboxVisible && result.sameSrc && result.lightboxLoads,
    ...result,
    screenshotPath,
  };

  await writeFile(join(OUT, 'chat-lightbox-result.json'), JSON.stringify(payload, null, 2));
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
