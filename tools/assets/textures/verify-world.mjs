// Post-build evidence: node tools/assets/textures/verify-world.mjs http://127.0.0.1:4186
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:4186';
const output = process.argv[3] ?? 'tmp/gfx-p2/low';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], requests = [], cancelledEnvironments = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => {
    const failure = `${request.url()}: ${request.failure()?.errorText}`;
    // P1 cancels obsolete HDRI fetches when quality changes; retain the evidence.
    if (request.url().includes('/world/env/') && request.failure()?.errorText === 'net::ERR_ABORTED') cancelledEnvironments.push(failure);
    else errors.push(failure);
  });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => { if (request.url().includes('/world/tex/')) requests.push(request.url()); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto(`${base}/vi/`);
  if (requests.length) throw new Error('Photo textures loaded on welcome');
  await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  const world = page.locator('.world-viewport[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({ state: 'visible', timeout: 120000 });
  for (const quality of ['low', 'balanced', 'high', 'low']) {
    await page.keyboard.press('Escape');
    await page.locator(`.world-menu dialog input[value="${quality}"]`).check();
    await page.keyboard.press('Escape');
    await world.locator('canvas').focus();
    const size = { low: 512, balanced: 1024, high: 2048 }[quality];
    if (quality !== 'low') await page.waitForFunction(size => performance.getEntriesByType('resource').some(entry => entry.name.endsWith(`/world/tex/surface-${size}.ktx2`)), size, { timeout: 60000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(4000);
    console.info(`World quality ${quality}: ${await world.getAttribute('data-world-quality')}`);
  }
  await page.screenshot({ path: `${output}/ingame-first-light.png` });
  await writeFile(`${output}/capture.json`, JSON.stringify({ base, errors, requests, cancelledEnvironments,
    photoResources: await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/world/tex/')).map(entry => ({ url: entry.name, startTime: entry.startTime, duration: entry.duration }))),
  }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  console.info('World Low/Balanced/High/Low, CC0 network and console: PASS');
} finally { await browser.close(); }
