// Local Edge review. Source mode allows visual iteration before the single build.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { captureIngame } from '../../review/ingame-shots.mjs';
import { execFileSync } from 'node:child_process';

const label = process.argv[2] ?? 'before';
const production = process.argv.includes('--production');
const low = label.startsWith('low');
const evidence = 'tools/assets/blender/hr-casuarina-review';
await mkdir(`${evidence}/${label}`, { recursive: true });
const baseline = JSON.parse(await readFile('tools/styleframes/.vite/test-results/hr-props2/after/metrics.json', 'utf8'));
const report = { label, production, samples: [], errors: [] };
let cdp;
async function onPage(page) {
  cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__tqaJourney = true; window.__tqaSkipIntro = true;
    window.__shoreTiming = { clicked: null, playable: null };
    document.addEventListener('click', e => {
      if (e.target.closest?.('button')?.textContent.trim() === 'Enter World') window.__shoreTiming.clicked = performance.now();
    }, true);
    new MutationObserver(() => {
      if (window.__shoreTiming.clicked !== null && window.__shoreTiming.playable === null && document.querySelector('[data-world-build="done"][data-world-intro="done"]')) window.__shoreTiming.playable = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true });
    window.__shoreFrames = [];
    let calls = 0, triangles = 0;
    for (const [name, count, instances] of [['drawElements', 1], ['drawArrays', 2], ['drawElementsInstanced', 1, 4], ['drawArraysInstanced', 2, 3]]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        calls++; if (args[0] === 4) triangles += args[count] / 3 * (instances === undefined ? 1 : args[instances]);
        return original.apply(this, args);
      };
    }
    requestAnimationFrame(function frame() {
      if (calls) window.__shoreFrames.push({ calls, triangles });
      calls = triangles = 0; requestAnimationFrame(frame);
    });
  });
}
async function onZone(page, world, zone) {
  if (!['quiet-shore', 'last-postcard'].includes(zone)) return;
  const pose = baseline.samples.find(s => s.zone === zone).pose;
  await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
  await page.waitForTimeout(low ? 5000 : 25000);
  await page.bringToFront(); await world.locator('canvas').focus();
  await page.screenshot({ path: `${evidence}/${label}/${zone}.png` });
  await page.evaluate(() => { window.__shoreFrames = []; });
  const start = await cdp.send('Performance.getMetrics');
  await page.waitForTimeout(5000);
  const end = await cdp.send('Performance.getMetrics');
  const metric = (r, n) => r.metrics.find(m => m.name === n).value;
  const seconds = metric(end, 'Timestamp') - metric(start, 'Timestamp');
  const frames = await page.evaluate(() => window.__shoreFrames);
  const observation = await world.locator('canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, focused: document.hasFocus(), visible: document.visibilityState };
  });
  const sample = { zone, pose, quality: await world.getAttribute('data-world-quality'), ...observation,
    fps: frames.length / seconds, calls: frames.reduce((s, f) => s + f.calls, 0) / frames.length,
    triangles: frames.reduce((s, f) => s + f.triangles, 0) / frames.length,
    cpuMsPerSecond: 1000 * (metric(end, 'TaskDuration') - metric(start, 'TaskDuration')) / seconds };
  report.samples.push(sample); console.log(JSON.stringify(sample));
  report.timing = await page.evaluate(() => window.__shoreTiming);
  report.resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/world/lib/')).map(r => ({ url: r.name, start: r.startTime, bytes: r.encodedBodySize })));
  if (!frames.length || !sample.focused || sample.visible !== 'visible') throw new Error('Invalid frame sample');
  if (!production && !low) {
    const trees = await page.evaluate(() => {
      const found = [];
      window.__shoreScene.traverse(m => {
        if (m.isInstancedMesh && /hr-(coast|tree-casuarina)/.test(m.parent?.name ?? '') && m.count) {
          found.push({ name: m.parent.name, count: m.count, matrix: Array.from(m.instanceMatrix.array.slice(0, 16)), world: m.matrixWorld.elements });
        }
      });
      return found;
    });
    report.samples.at(-1).trees = trees;
  }
  await world.evaluate(e => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
}
try {
  if (production) {
    report.buildId = (await readFile('tools/styleframes/.vite/test-results/hr-casuarina/build-workspace/.next/BUILD_ID', 'utf8')).trim();
    await captureIngame({ outDir: `${evidence}/${label}`, baseUrl: process.env.CASUARINA_BASE_URL ?? 'http://127.0.0.1:4215', showcase: { quality: low ? 'low' : 'high', onPage, onZone } });
  } else {
    const originals = new Map();
    if (label.startsWith('before')) for (const name of ['hr-runtime', 'hr-library', 'hr-coastal', 'hr-variation', 'coast-r1', 'scatter']) {
      originals.set(`/src/features/world/foliage/${name}.ts`, execFileSync('git', ['show', `HEAD:src/features/world/foliage/${name}.ts`], { encoding: 'utf8' }));
    }
    const server = await createServer({ configFile: false, cacheDir: 'tools/styleframes/.vite/test-results/hr-casuarina/source-cache',
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      plugins: [{ name: 'shore-review', enforce: 'pre', configureServer(s) { s.middlewares.use(async (req, res, next) => {
        if (req.url === '/shore.html') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="icon" href="data:,"><style>html,body,#world{width:100%;height:100%;margin:0;overflow:hidden}canvas{display:block}</style><div id="world" class="world-viewport" tabindex="0"></div><script type="module">import {mountWorld} from "/src/features/world/index.ts";window.disposeWorld=await mountWorld(document.getElementById("world"),{locale:"en",quality:"high",debug:true});</script>'); return; }
        if (req.url === '/en/world-content.json') { res.setHeader('content-type', 'application/json'); res.end(await readFile('out/en/world-content.json')); return; }
        next();
      }); }, transform(source, id) {
        const normalized = id.replaceAll('\\', '/').split('?')[0];
        for (const [suffix, original] of originals) if (normalized.endsWith(suffix)) return original;
        if (id.replaceAll('\\', '/').endsWith('/world/index.ts')) return source.replace('const scene = new Scene();', 'const scene = new Scene(); globalThis.__shoreScene = scene;');
      } }], server: { host: '127.0.0.1', port: 4213, strictPort: true, watch: null } });
    await server.listen();
    const browser = await chromium.launch({ channel: 'msedge', headless: false });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); await onPage(page);
      await page.goto('http://127.0.0.1:4213/shore.html');
      const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
      await world.waitFor({ timeout: 180000 });
      for (const zone of ['quiet-shore', 'last-postcard']) {
        await world.evaluate(async (e, z) => e.__tqaJourney.goTo(z), zone);
        await world.evaluate((e, quality) => e.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality } })), low ? 'low' : 'high');
        await onZone(page, world, zone);
      }
      await page.evaluate(() => window.disposeWorld());
    } finally { await browser.close(); await server.close(); }
  }
} finally { await writeFile(`${evidence}/${label}/metrics.json`, JSON.stringify(report, null, 2)); }
if (report.errors.length) throw new Error(report.errors.join('\n'));
