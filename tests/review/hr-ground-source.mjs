// Art iteration without a Next build. Production evidence uses hr-ground.mjs.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const label = process.argv[2] ?? 'preview';
const directory = `test-results/hr-ground/${label}`;
await mkdir(directory, { recursive: true });
await mkdir('tmp/hr-ground/preview', { recursive: true });
await writeFile('tmp/hr-ground/preview/index.html', '<!doctype html><link rel="icon" href="data:,"><style>html,body,#world{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><div id="world" tabindex="0"></div><script type="module" src="./main.js"></script>');
await writeFile('tmp/hr-ground/preview/main.js', `import {mountWorld} from '/src/features/world/index.ts';const el=document.getElementById('world');await mountWorld(el,{locale:'en',quality:'high',debug:true});el.dispatchEvent(new CustomEvent('tqa:set-quality',{detail:{quality:'high'}}));`);
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.cache/hr-ground-review',
  plugins: [{ name: 'ground-preview-content', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (req.url !== '/en/world-content.json') return next();
      res.setHeader('Content-Type', 'application/json'); res.end(await readFile('out/en/world-content.json'));
    });
  } }], define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  server: { host: '127.0.0.1', port: 4551, strictPort: true, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(150000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto('http://127.0.0.1:4551/tmp/hr-ground/preview/index.html');
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor(); await page.bringToFront(); await world.locator('canvas').focus();
  const poses = JSON.parse(await readFile('test-results/hr-ground/poses.json', 'utf8'));
  for (const zone of ['first-light', 'roots', 'old-trail', 'horizon', 'quiet-shore', 'last-postcard']) {
    if (zone !== 'first-light') await world.evaluate((el, id) => el.__tqaJourney.goTo(id), zone);
    await page.waitForTimeout(20000);
    if (errors.length) throw new Error(errors.join('\n'));
    for (const view of zone === 'horizon' ? [zone, 'horizon-summit'] : [zone]) {
      await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), poses[view]);
      await page.waitForTimeout(2000); await page.screenshot({ path: `${directory}/${view}.png` });
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`${view}: ${await world.getAttribute('data-world-quality')}`);
    }
    await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
  }
} finally { await writeFile(`${directory}/errors.json`, JSON.stringify(errors, null, 2)); await browser.close(); await server.close(); }
if (errors.length) throw new Error(errors.join('\n'));
