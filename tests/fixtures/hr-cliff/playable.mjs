// Run separately from e2e/build to avoid parallel SwiftShader contention.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] ?? 'http://127.0.0.1:4545';
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const samples = [];
try {
  for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.url().includes('/world/cliff/')) requests.push(r.url()); });
    await page.addInitScript(() => {
      window.__tqaSkipIntro = true;
      window.__cliffTiming = {};
      let pinned = false;
      new MutationObserver(() => {
        const world = document.querySelector('[data-world-quality]');
        if (world && !pinned) {
          pinned = true;
          world.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'low' } }));
        }
        if (!window.__cliffTiming.playableAt && document.querySelector('[data-world-build="done"][data-world-intro="done"]')) window.__cliffTiming.playableAt = performance.now();
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-world-quality', 'data-world-build', 'data-world-intro'] });
      document.addEventListener('click', e => { if (e.target.closest('button')?.textContent.trim() === 'Enter World') window.__cliffTiming.enterAt = performance.now(); }, true);
    });
    await page.goto(`${base}/en/`);
    await page.getByRole('button', { name: 'Enter World', exact: true }).click();
    await page.locator('[data-world-build="done"][data-world-intro="done"]').waitFor({ timeout: 120000 });
    await page.waitForTimeout(6000);
    const sample = await page.evaluate(() => ({ ...window.__cliffTiming, playableMs: window.__cliffTiming.playableAt - window.__cliffTiming.enterAt, quality: document.querySelector('[data-world-quality]').dataset.worldQuality, resources: performance.getEntriesByType('resource').filter(e => e.name.includes('/world/cliff/')).map(e => ({ url: e.name, startTime: e.startTime })) }));
    samples.push({ run, ...sample, requests, errors });
    console.log(JSON.stringify(samples.at(-1)));
    if (requests.length || errors.length || sample.quality !== 'low') throw new Error('Low isolation failed');
    await context.close();
  }
} finally {
  await browser.close();
  await mkdir('test-results/hr-cliff/return1', { recursive: true });
  await writeFile('test-results/hr-cliff/return1/playable.json', JSON.stringify({ scope: 'Production static export; three fresh contexts, no e2e/build running. Pin Low through existing event when world is mounted; skip cinematic.', samples }, null, 2));
}
