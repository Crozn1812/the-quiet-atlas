// Source-only art iteration. The one final build and e2e run remain separate.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const label = process.argv[2] ?? 'preview';
const directory = `test-results/hr-terrain-cliff/return1/${label}`;
await mkdir(directory, { recursive: true });
await mkdir('tmp/hr-terrain-cliff/preview', { recursive: true });
await writeFile('tmp/hr-terrain-cliff/preview/index.html', '<!doctype html><link rel="icon" href="data:,"><style>html,body,#world{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><div id="world" tabindex="0"></div><script type="module" src="./main.js"></script>');
await writeFile('tmp/hr-terrain-cliff/preview/main.js', `import {mountWorld} from '/src/features/world/index.ts';const el=document.getElementById('world');await mountWorld(el,{locale:'en',quality:'high',debug:true});el.dispatchEvent(new CustomEvent('tqa:set-quality',{detail:{quality:'high'}}));`);
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.cache/hr-terrain-cliff-review',
  plugins: [{ name: 'cliff-preview-content', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (req.url !== '/en/world-content.json') return next();
      res.setHeader('Content-Type', 'application/json'); res.end(await readFile('out/en/world-content.json'));
    });
  } }],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') }, server: { host: '127.0.0.1', port: 4548, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(150000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location().url}`); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto('http://127.0.0.1:4548/tmp/hr-terrain-cliff/preview/index.html');
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor(); await page.bringToFront(); await world.locator('canvas').focus();
  await page.waitForTimeout(20000);
  const poses = {
    'first-light': { position: [16, 10, 9], target: [-10, 15, -8] },
    'spring-ribbon': { position: [4, 9, 4], target: [-7, 12, -3] },
    'spring-west': { position: [-24, 12, 10], target: [-36, 17, -10] },
    'spring-central': { position: [4, 12, -4], target: [-14, 22, -29] },
    'spring-east': { position: [27, 13, -18], target: [-1, 22, -41] },
    'spring-end': { position: [38, 12, -35], target: [13, 18, -52] },
    'crest': { position: [17, 39, -20], target: [4, 39, -38] },
  };
  for (const [name, pose] of Object.entries(poses)) {
    await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
    await page.waitForTimeout(1500); await page.screenshot({ path: `${directory}/${name}.png` });
    console.log(`${name}: ${await world.getAttribute('data-world-quality')}`);
  }
  await writeFile(`${directory}/errors.json`, JSON.stringify(errors, null, 2));
} finally { await browser.close(); await server.close(); }
if (errors.length) throw new Error(errors.join('\n'));
