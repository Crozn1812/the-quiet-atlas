// GFX-01: Edge capture + whole-frame instrumentation. State stays in memory.
// Start: pnpm exec vite tools/styleframes. Run: node tools/styleframes/capture-aaa.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';
import { summarizeAssetBytes, writeShowcase } from './aaa/report.mjs';

const preview = process.argv.includes('--preview');
const out = resolve(process.argv[2]?.startsWith('--') ? 'tmp/gfx01-preview' : process.argv[2] ?? 'docs/showcase/37-aaa');
const base = process.env.GFX01_BASE_URL ?? 'http://127.0.0.1:4190';
await mkdir(out, { recursive: true });
// CDP supports an Edge instance launched by PowerShell on managed Windows hosts.
const browser = process.env.GFX01_CDP_URL
  ? await chromium.connectOverCDP(process.env.GFX01_CDP_URL)
  : await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [], rows = [], network = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) network.push(`${response.status()} ${response.url()}`); });
const scenes = ['first-light', 'horizon', 'last-postcard'];
try {
  await page.goto(`${base}/aaa.html`);
  await page.waitForFunction(() => window.__aaaBench?.ready || window.__aaaBench?.error, null, { timeout: 120_000 });
  const initialError = await page.evaluate(() => window.__aaaBench.error);
  if (initialError) throw new Error(initialError);
  for (const quality of preview ? ['High'] : ['High', 'Low']) for (const scene of scenes) for (const variant of preview ? ['B'] : ['A', 'B', 'C']) {
    const selection = { scene, variant, quality };
    await page.evaluate(async value => { await window.__aaaBench.select(value); window.__aaaBench.clean(true); }, selection);
    await page.waitForFunction(() => window.__aaaBench.ready || window.__aaaBench.error, null, { timeout: 120_000 });
    const state = await page.evaluate(() => ({ cost: window.__aaaBench.cost(), error: window.__aaaBench.error }));
    if (state.error) throw new Error(state.error);
    rows.push({ ...selection, ...state.cost });
    if (quality === 'High' || variant === 'B') await page.screenshot({ path: join(out, `${scene}-${variant}-${quality}.png`) });
    console.info(`${scene} ${variant} ${quality}: ${state.cost.calls} calls / ${state.cost.triangles} triangles / GPU ${state.cost.gpuMedianMs?.toFixed(2) ?? 'unavailable'} ms / RAF p95 ${state.cost.frameP95Ms.toFixed(2)} ms`);
    if (errors.length || network.length) throw new Error([...errors, ...network].join('\n'));
  }
  if (!preview) {
    await page.setViewportSize({ width: 960, height: 540 });
    await page.waitForFunction(() => window.__aaaBench.ready);
    await page.evaluate(() => window.__aaaBench.clean(false));
    await page.getByLabel('Hướng', { exact: false }).selectOption('A');
    await page.waitForFunction(() => window.__aaaBench.ready);
    if (errors.length || network.length) throw new Error([...errors, ...network].join('\n'));
    const assets = JSON.parse(await readFile('tools/styleframes/aaa/asset-bytes.json', 'utf8'));
    const assetBytes = summarizeAssetBytes(assets);
    const report = { status: 'captured', capturedAt: new Date().toISOString(), viewport: '1600x900', device: rows[0].device, method: '45 warm-up frames, >=120 RAF/CPU samples (rolling window <=240); >=30 non-disjoint GPU samples when supported. Counts include all render, shadow and post passes.', assetBytes, rows, errors, network };
    await writeFile('tools/styleframes/aaa/results.json', JSON.stringify(report, null, 2) + '\n');
    await writeShowcase(out, report);
  }
  console.info(`PASS: ${rows.length} configurations; ${preview ? 3 : 12} PNG 1600x900; no browser/HTTP errors.`);
} finally { await browser.close(); }
