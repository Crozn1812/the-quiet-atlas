// Source preview before the single final build; production captures use --base.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const label = process.argv[2] ?? 'after';
const lowOnly = process.env.HR_CLIFF_LOW_ONLY === '1';
const out = `test-results/hr-cliff/return1/${label}`;
await mkdir(out, { recursive: true });
let server;
const base = process.argv[3];
if (!base) {
  await mkdir('tmp/hr-cliff/review', { recursive: true });
  await writeFile('tmp/hr-cliff/review/index.html', '<!doctype html><link rel="icon" href="data:,"><style>html,body,#world{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><div id="world" tabindex="0"></div><script type="module" src="./main.js"></script>');
  const quality = lowOnly ? 'low' : 'high';
  await writeFile('tmp/hr-cliff/review/main.js', `import {mountWorld} from '/src/features/world/index.ts'; const el=document.getElementById('world'); await mountWorld(el,{locale:'en',quality:'${quality}',debug:true}); el.dispatchEvent(new CustomEvent('tqa:set-quality',{detail:{quality:'${quality}'}}));`);
  const baseline = process.env.HR_CLIFF_BASELINE === '1';
  const snapshots = baseline ? new Map(await Promise.all([
    ['terrain/spring.ts', 'before-spring.txt'], ['zones/first-light-cliff.ts', 'before-geometry.txt'],
    ['zones/first-light-cliff-detail.ts', 'before-detail.txt'],
  ].map(async ([file, snapshot]) => [file, await readFile(`tmp/hr-cliff/return1/${snapshot}`, 'utf8')]))) : new Map();
  server = await createServer({ configFile: false, cacheDir: 'node_modules/.cache/hr-cliff-review', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, plugins: [{ name: 'cliff-review-baseline', enforce: 'pre', load(id) { for (const [file, source] of snapshots) if (id.replaceAll('\\', '/').endsWith(`/src/features/world/${file}`)) return source; }, configureServer(vite) { if (baseline) vite.middlewares.use(async (req, res, next) => { if (!req.url?.startsWith('/world/cliff/')) return next(); try { const bytes = await readFile(`tmp/hr-cliff/return1/baseline/${req.url.split('/').at(-1)}`); res.setHeader('Content-Type', req.url.endsWith('.ktx2') ? 'image/ktx2' : 'model/gltf-binary'); res.end(bytes); } catch { next(); } }); } }], server: { host: '127.0.0.1', port: 4546, strictPort: true } });
  await server.listen();
}
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const errors = [], requests = [], shots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(150000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (r.url().includes('/world/cliff/')) requests.push(r.url()); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  if (lowOnly) await page.addInitScript(() => {
    let pinned = false;
    new MutationObserver(() => {
      const world = document.querySelector('[data-world-quality]');
      if (world && !pinned) { pinned = true; world.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'low' } })); }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-world-quality'] });
  });
  await page.goto(base ? `${base}/en/` : 'http://127.0.0.1:4546/tmp/hr-cliff/review/index.html');
  if (base) await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor(); await page.bringToFront(); await world.locator('canvas').focus();
  if (base) { await page.keyboard.press('Escape'); await page.locator(`.world-menu input[value="${lowOnly ? 'low' : 'high'}"]`).check(); await page.keyboard.press('Escape'); }
  await page.waitForTimeout(lowOnly ? 6000 : 18000);
  const poses = {
    gameplay: null,
    wide: { position: [30,46,10], target: [-13,23,-28] },
    face: { position: [4,9,4], target: [-4,10,0] },
    close: { position: [-3,10,0], target: [-7,12,-3] },
  };
  for (const [name, pose] of lowOnly ? [] : Object.entries(poses)) {
    await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/high-${name}.png` });
    shots.push({ name, pose, quality: await world.getAttribute('data-world-quality') });
  }
  await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'low' } })));
  await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), poses.face);
  await page.waitForTimeout(2000); await page.screenshot({ path: `${out}/low-face.png` });
  await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), poses.wide);
  await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/low-wide.png` });
  const info = await world.evaluate(el => el.__tqaPerf?.info());
  await writeFile(`${out}/${lowOnly ? 'capture-low' : 'capture'}.json`, JSON.stringify({ shots, errors, requests, info }, null, 2));
  console.log(JSON.stringify({ label, errors, info }));
} finally { await browser.close(); await server?.close(); }
if (errors.length) process.exitCode = 1;
