// Source smoke before the single production build. No shipped instrumentation.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
await mkdir('test-results/hr-props/source', { recursive: true });
await writeFile('tmp/hr-props/source.html', '<!doctype html><link rel="icon" href="data:,"><style>html,body,#world{width:100%;height:100%;margin:0;overflow:hidden}canvas{display:block}</style><div id="world" class="world-viewport" tabindex="0"></div><script type="module">import {mountWorld} from "/src/features/world/index.ts";window.__disposeWorld=await mountWorld(document.getElementById("world"),{locale:"en",quality:"high",debug:true});</script>');
const server = await createServer({ configFile: false, define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [{ name: 'hr-props-inspect', enforce: 'pre', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url !== '/en/world-content.json') return next();
      res.setHeader('content-type', 'application/json'); res.end(await readFile('out/en/world-content.json'));
    });
  }, transform(source, id) {
    if (!id.replaceAll('\\', '/').endsWith('/props/hr-props.ts')) return;
    return source.replace('const fallback = mesh.geometry, empty', '(globalThis.__propsMeshes ??= []).push(mesh); const fallback = mesh.geometry, empty');
  } }], server: { host: '127.0.0.1', port: 4201, strictPort: true,
    watch: { ignored: ['**/tmp/**', '**/tests/**', '**/tools/**', '**/test-results/**'] } } }); await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], samples = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto('http://127.0.0.1:4201/tmp/hr-props/source.html');
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await page.locator('canvas').waitFor({ timeout: 120000 }); await page.bringToFront(); await page.locator('canvas').focus();
  await world.waitFor({ timeout: 180000 }); await world.locator('canvas').focus();
  await world.evaluate(e => e.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'high' } })));
  for (const zone of (process.env.HR_PROPS_SMOKE_ZONES?.split(',') ?? ['workshop', 'milestones', 'old-trail', 'horizon', 'quiet-shore', 'last-postcard'])) {
    await world.evaluate(async (e, zone) => e.__tqaJourney.goTo(zone), zone);
    await page.waitForTimeout(25000);
    const state = await page.evaluate(() => window.__propsMeshes.map(m => ({ name: m.name, ready: m.userData.hrPropsReady, error: m.userData.hrPropsError, children: m.children.flatMap(g => g.children.map(c => c.name)) })));
    samples.push({ zone, quality: await world.getAttribute('data-world-quality'), state }); console.log(JSON.stringify(samples.at(-1)));
    await page.screenshot({ path: `test-results/hr-props/source/${zone}.png` });
  }
  await page.evaluate(() => window.__disposeWorld());
} finally {
  await browser.close(); await server.close(); await writeFile('test-results/hr-props/source/report.json', JSON.stringify({ errors, samples }, null, 2));
}
if (errors.length || samples.some(s => s.state.some(m => m.error))) throw new Error(JSON.stringify({ errors, samples }));
