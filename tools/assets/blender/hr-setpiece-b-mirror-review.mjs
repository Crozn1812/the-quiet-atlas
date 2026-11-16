// HR-SETPIECE-B: orbit the parked GD110 at mirror height so the rider-side glass is on record
// (the HR-AUDIT vehicle poses only see the shells from the front). Edge hardware, High, port E2E_PORT.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { sharp } from '../../review/luma.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const dest = path.resolve(root, process.argv[2] ?? 'test-results/hr-setpiece-b/after');
const base = `http://127.0.0.1:${process.env.E2E_PORT ?? 4207}`;
await mkdir(dest, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(120_000);
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  const requests = [];
  page.on('request', r => { if (/setpiece-mirror/.test(r.url())) requests.push(r.url()); });
  await page.goto(`${base}/en/`);
  await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  const world = page.locator('.world-viewport[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({ state: 'visible' });
  const canvas = world.locator('canvas');
  await canvas.focus(); await page.keyboard.press('Escape');
  await page.locator('.world-menu dialog input[value="high"]').check();
  await page.keyboard.press('Escape'); await canvas.focus();
  await world.evaluate(el => el.__tqaJourney.goTo('first-light'));
  await world.evaluate(el => el.__tqaJourney.nearVehicle());
  await page.waitForTimeout(8000);
  const p = await world.evaluate(el => { const q = el.__tqaJourney.position(); return [q.x, q.y, q.z]; });
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, position = [p[0] + Math.cos(a) * 2.4, p[1] + 0.75, p[2] + Math.sin(a) * 2.4], target = [p[0], p[1] + 0.35, p[2]];
    await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), { position, target });
    await page.waitForTimeout(2500);
    const clean = await page.addStyleTag({ content: '.world-viewport > :not(canvas), .world-hud { visibility: hidden !important; }' });
    await sharp(await page.screenshot()).webp({ quality: 94 }).toFile(path.join(dest, `mirror-orbit-${i}.webp`));
    await clean.evaluate(el => el.remove());
  }
  console.log('player', p.map(v => v.toFixed(2)).join(', '), 'mirror requests', requests.length);
} finally { await browser.close(); }
