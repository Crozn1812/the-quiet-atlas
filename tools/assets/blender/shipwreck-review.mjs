// Headed local Edge evidence; uses existing opt-in journey/postcard review hooks.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const base = process.argv[2] ?? 'http://127.0.0.1:4201';
const out = 'test-results/qf-07'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--ignore-gpu-blocklist'] });
const report = { errors: [], assetRequests: [], views: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); if (m.type() === 'warning') console.log('warning', m.text()); });
  page.on('response', r => { if (r.url().includes('shipwreck.glb')) report.assetRequests.push({ url: r.url(), status: r.status() }); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto(`${base}/en/`);
  await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  const world = page.locator('.world-viewport[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor();
  const canvas = world.locator('canvas');
  for (const [quality, zone, name] of [['high','quiet-shore','high-coastal-road'], ['high','last-postcard','high-last-postcard'], ['low','last-postcard','low-last-postcard'], ['high','quiet-shore','high-distance-1km']]) {
    await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
    await canvas.focus(); await page.keyboard.press('Escape');
    await page.locator(`.world-menu dialog button[value="${quality}"]`).click();
    await page.keyboard.press('Escape');
    await world.evaluate((el,id) => el.__tqaJourney.goTo(id), zone);
    const pos = await world.evaluate(el => el.__tqaJourney.position());
    // Exact pathPointAt(.95), surfaceHeight + 2.5 m: between the two coast zones,
    // beyond the Quiet Shore shelter, which otherwise occludes the offshore view.
    const camera = name === 'high-distance-1km' ? [0, 3.3, -1970]
      : name === 'high-coastal-road' ? [6.42363068486803, 3.223555759076943, -540.3061074982323]
      : [pos.x, pos.y + 1.6, pos.z];
    await world.evaluate((el,position) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: { position, target: [0, 16, -970] } })), camera);
    await page.waitForLoadState('networkidle'); await page.waitForTimeout(3500);
    await expect(world).toHaveAttribute('data-world-quality', quality);
    const devBadge = await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await canvas.screenshot({ path: `${out}/${name}.png` });
    // Native-resolution crop: do not resize or sharpen the evidence.
    const bounds = await canvas.boundingBox();
    await page.screenshot({ path: `${out}/${name}-ship-crop.png`, clip: {
      x: bounds.x + 650, y: bounds.y + 320, width: 300, height: 220,
    } });
    await devBadge.evaluate(el => el.remove());
    report.views.push({ name, quality, zone, camera, target: [0,16,-970], file: `${out}/${name}.png` });
    console.log('captured', name, camera);
  }
  expect(report.assetRequests.some(r => r.status === 200)).toBe(true);
  expect(report.errors).toEqual([]);
} finally {
  await writeFile(`${out}/review.json`, JSON.stringify(report,null,2)+'\n'); await browser.close();
}
