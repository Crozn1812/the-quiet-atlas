// Source-only Edge GPU evidence when reviewing the HR character. Production build/e2e are separate gates.
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { baselinePlugin } from './hr-char-b-baseline.mjs';

const directory = 'tmp/hr-char-world';
const output = process.env.HR_REVIEW_OUTPUT ?? 'test-results/hr-char-b/world';
const port = Number(process.env.HR_REVIEW_PORT ?? 4203);
// Vite does not implement Next's generated content route. Serve the actual
// static export in the QA harness so Roots uses real content in both A and B.
const content = await readFile('out/en/world-content.json');
const contentPlugin = { name: 'hr-review-static-content', configureServer(server) {
  server.middlewares.use((req, res, next) => {
    if (req.url?.split('?')[0] !== '/en/world-content.json') return next();
    res.setHeader('Content-Type', 'application/json'); res.end(content);
  });
} };
await mkdir(directory, { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(`${directory}/index.html`, `<!doctype html><html><head><link rel="icon" href="data:,"></head>
<body style="margin:0"><div id="world" style="width:1600px;height:900px"></div>
<script type="module" src="/${directory}/viewer.js"></script></body></html>`);
await writeFile(`${directory}/viewer.js`, `
import { mountWorld } from '/src/features/world/index.ts';
window.__tqaSkipIntro = true; window.__tqaJourney = true;
window.unmount = await mountWorld(document.querySelector('#world'), { quality: 'high' });
window.ready = true;
`);
const report = { mode: 'Vite source review, not the production export; non-isolated machine; ABBA order', runs: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: false });
try {
  for (const [index, variant] of ['before', 'after', 'after', 'before'].entries()) {
    const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: `tmp/hr-char-cache/node_modules/world-${variant}`,
      plugins: [contentPlugin, ...(variant === 'before' ? [baselinePlugin()] : [])],
      server: { host: '127.0.0.1', port, strictPort: true,
        watch: { ignored: ['**/tmp/hr-char-evidence/**', '**/tmp/hr-char-check/**'] } } });
    await server.listen();
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const run = { index, variant, errors: [], samples: [] };
    report.runs.push(run);
    try {
      page.on('pageerror', error => run.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') run.errors.push(`${message.text()} (${message.location().url})`); });
      page.on('response', response => { if (response.status() >= 400) console.log('HTTP', response.status(), response.url()); });
      await page.addInitScript(() => {
        const counts = { calls: 0, triangles: 0 };
        for (const [method, indexed, instanced] of [['drawArrays', false, false], ['drawElements', true, false], ['drawArraysInstanced', false, true], ['drawElementsInstanced', true, true]]) {
          const original = WebGL2RenderingContext.prototype[method];
          WebGL2RenderingContext.prototype[method] = function (...args) {
            counts.calls++;
            const vertices = args[indexed ? 1 : 2], instances = instanced ? args[indexed ? 4 : 3] : 1;
            counts.triangles += (args[0] === 4 ? vertices / 3 : args[0] === 5 || args[0] === 6 ? Math.max(0, vertices - 2) : 0) * instances;
            return original.apply(this, args);
          };
        }
        window.hrCounts = counts;
      });
      const started = Date.now();
      await page.goto(`http://127.0.0.1:${port}/${directory}/index.html`);
      await page.waitForFunction(() => window.ready && document.querySelector('[data-world-build="done"]'), null, { timeout: 120000 });
      run.sourceMountToBuildDoneMs = Date.now() - started;
      run.gpu = await page.evaluate(() => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      });
      assert.ok(run.gpu && !/swiftshader|software|llvmpipe/i.test(run.gpu), run.gpu);
      const world = page.locator('#world'), canvas = world.locator('canvas');
      await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'high' } })));
      await page.bringToFront();
      await world.evaluate(el => el.__tqaJourney.goTo('first-light'));
      await canvas.focus();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(4000);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      const cpu = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
      async function sample(kind) {
        const a = await cpu();
        const frames = await page.evaluate(() => new Promise(resolve => {
          const samples = [], start = performance.now(); let last = start;
          const tick = now => {
            samples.push({ ms: now - last, ...window.hrCounts });
            window.hrCounts.calls = window.hrCounts.triangles = 0; last = now;
            if (now - start < 3000) requestAnimationFrame(tick); else resolve(samples.slice(1));
          };
          window.hrCounts.calls = window.hrCounts.triangles = 0;
          requestAnimationFrame(tick);
        }));
        const b = await cpu(), seconds = frames.reduce((sum, f) => sum + f.ms, 0) / 1000;
        const sample = { kind, fps: frames.length / seconds,
          drawCallsAllPasses: frames.reduce((sum, f) => sum + f.calls, 0) / frames.length,
          trianglesAllPasses: frames.reduce((sum, f) => sum + f.triangles, 0) / frames.length,
          cpuTaskMsPerSecond: (b.TaskDuration - a.TaskDuration) * 1000 / (b.Timestamp - a.Timestamp),
          player: await world.evaluate(el => el.__tqaJourney.position()), quality: await world.getAttribute('data-world-quality') };
        run.samples.push(sample); console.log(variant, kind, JSON.stringify(sample));
      }
      const capture = index < 2;
      if (capture) await page.screenshot({ path: `${output}/${variant}-whole.png` });
      await page.mouse.move(800, 450); await page.mouse.wheel(0, -2000); await page.waitForTimeout(1000);
      if (capture) await page.screenshot({ path: `${output}/${variant}-close.png` });
      await page.keyboard.down('w');
      await sample('walking');
      if (capture) await page.screenshot({ path: `${output}/${variant}-walking.png` });
      await page.keyboard.up('w');
      await world.evaluate(el => el.__tqaJourney.nearVehicle());
      await canvas.focus(); await page.keyboard.press('e');
      await page.waitForFunction(() => ['manual', 'cruise'].includes(document.querySelector('#world').dataset.worldVehicle));
      await page.waitForTimeout(3000); await page.keyboard.down('w');
      await sample('riding');
      if (capture) await page.screenshot({ path: `${output}/${variant}-riding.png` });
      run.rider = await world.evaluate(el => el.__tqaJourney.rider());
      await page.keyboard.up('w');
      if (variant === 'after' && capture) {
        await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'low' } })));
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${output}/after-low.png` });
      }
      assert.deepEqual(run.errors, []);
    } finally {
      await writeFile(`${output}/runtime.json`, JSON.stringify(report, null, 2));
      await page.close(); await server.close();
    }
  }
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
