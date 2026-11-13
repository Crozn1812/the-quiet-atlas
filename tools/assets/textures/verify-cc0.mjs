import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('tmp/gfx-p2/review', { recursive: true });
const software = process.env.PHOTO_SWIFTSHADER === '1';
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  ...(software ? { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } : {}) });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.text().includes('PHOTO_GPU')) console.info(message.text());
  });
  await page.goto('http://127.0.0.1:4188/tools/assets/textures/review.html');
  await page.waitForSelector('body[data-ready="true"]', { timeout: 120000 })
    .catch(error => { throw new Error([error.message, ...errors].join('\n')); });
  await page.screenshot({ path: `tmp/gfx-p2/review/gpu-${software ? 'software' : 'high'}.png` });
  if (errors.length) throw new Error(errors.join('\n'));
  console.info(`GFX-P2 Edge ${software ? 'SwiftShader fallback' : 'GPU'}: Low/Balanced/High PASS`);
} finally { await browser.close(); }
