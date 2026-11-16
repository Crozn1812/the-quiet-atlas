// Actual static export, Edge hardware GPU, no URL/cookie/storage state.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createOutServer } from '../../serve-out/index.mjs';

const port = Number(process.env.E2E_PORT ?? 4203);
const output = process.env.HR_REVIEW_OUTPUT ?? 'test-results/hr-char-b/production';
await mkdir(output, { recursive: true });
const server = createOutServer('out'); server.listen(port, '127.0.0.1'); await once(server, 'listening');
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const report = { mode: 'production static export; warm local filesystem; other workers may share the machine', errors: [], hrRequests: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  let entered = 0;
  page.on('request', req => { if (/character-hr.*glb/.test(req.url())) report.hrRequests.push({ path: new URL(req.url()).pathname, msAfterEnter: Date.now() - entered }); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto(`http://127.0.0.1:${port}/en/`);
  assert.equal(report.hrRequests.length, 0);
  entered = Date.now();
  await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  const world = page.locator('.world-viewport[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({ state: 'visible', timeout: 120000 });
  report.enterToPlayableMs = Date.now() - entered;
  report.hrRequestedAtPlayable = report.hrRequests.length;
  report.gpu = await world.locator('canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'); return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
  });
  assert.ok(report.gpu && !/swiftshader|software|llvmpipe/i.test(report.gpu));
  await page.keyboard.press('Escape');
  await page.locator('.world-menu dialog input[value="high"]').check();
  await page.keyboard.press('Escape');
  await world.locator('canvas').focus();
  await world.evaluate(el => el.__tqaJourney.goTo('first-light'));
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(2500);
  assert.equal(await world.getAttribute('data-world-quality'), 'high');
  await page.screenshot({ path: `${output}/after-high-whole.png` });
  await page.mouse.move(800, 450); await page.mouse.wheel(0, -2000); await page.waitForTimeout(500);
  await page.screenshot({ path: `${output}/after-high-close.png` });
  await page.keyboard.down('w'); await page.waitForTimeout(500);
  await page.screenshot({ path: `${output}/after-high-walking.png` }); await page.keyboard.up('w');
  await world.evaluate(el => el.__tqaJourney.nearVehicle());
  await world.locator('canvas').focus(); await page.keyboard.press('e');
  await page.waitForFunction(() => ['manual', 'cruise'].includes(document.querySelector('.world-viewport').dataset.worldVehicle));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${output}/after-high-riding.png` });
  await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'low' } })));
  await page.waitForTimeout(1000); await page.screenshot({ path: `${output}/after-low.png` });
  assert.equal(await world.getAttribute('data-world-quality'), 'low');
  assert.deepEqual(report.errors, []);
  await writeFile(`${output}/runtime.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
