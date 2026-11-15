// HR-SKY evidence, using the project's real ingame review path and fixed review camera.
// node tests/sky-review.mjs after|low (after the root production build).
// Clean-main comparison is captured separately by sky-source-review.mjs.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { captureIngame } from '../tools/review/ingame-shots.mjs';
import { createOutServer } from '../tools/serve-out/index.mjs';

const label = process.argv[2] ?? 'after';
if (!['after', 'low'].includes(label)) throw new Error('Use sky-source-review.mjs for a verified clean-main baseline');
const onlyZone = process.env.SKY_REVIEW_ZONE;
const root = path.resolve('tmp/hr-sky/return1/production');
const dest = path.join(root, label);
await mkdir(dest, { recursive: true });
const exportDir = process.env.SKY_REVIEW_OUT ?? 'out';
const poses = JSON.parse(await readFile('tmp/hr-sky/return1/before/poses.json', 'utf8'));
const server = createOutServer(path.resolve(exportDir));
server.listen(Number(process.env.E2E_PORT ?? 4202), '127.0.0.1'); await once(server, 'listening');
const report = { label, buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), measurements: [], errors: [] };
const done = new Error('capture complete');
let cdp;
try {
  await captureIngame({ outDir: dest, baseUrl: `http://127.0.0.1:${server.address().port}`, showcase: {
    quality: label === 'low' ? 'low' : 'high',
    async onPage(page) {
      cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      page.on('response', r => { if (r.status() >= 400) (report.httpErrors ??= []).push({url:r.url(),status:r.status()}); });
      await page.addInitScript(() => {
        const data = window.__skyReview = { clicked: null, playable: null, frames: [], calls: 0, triangles: 0 };
        document.addEventListener('click', e => { if (e.target.closest?.('button')?.textContent.trim() === 'Enter World') data.clicked = performance.now(); }, true);
        new MutationObserver(() => { if (data.clicked !== null && data.playable === null && document.querySelector('[data-world-build="done"][data-world-intro="done"]')) data.playable = performance.now(); }).observe(document, { subtree: true, childList: true, attributes: true });
        for (const [name, indexed, instanced] of [['drawElements', true, false], ['drawArrays', false, false], ['drawElementsInstanced', true, true], ['drawArraysInstanced', false, true]]) {
          const original = WebGL2RenderingContext.prototype[name];
          WebGL2RenderingContext.prototype[name] = function (...args) {
            data.calls++;
            if (args[0] === 4) data.triangles += args[indexed ? 1 : 2] / 3 * (instanced ? args[indexed ? 4 : 3] : 1);
            return original.apply(this, args);
          };
        }
        let previous = performance.now();
        function sample(now) {
          if (data.calls) data.frames.push({ ms: now - previous, calls: data.calls, triangles: data.triangles });
          previous = now; data.calls = data.triangles = 0; requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
    },
    async onZone(page, world, zone) {
      if (onlyZone && zone !== onlyZone) return;
      if (!['first-light', 'roots', 'horizon', 'quiet-shore', 'last-postcard'].includes(zone)) return;
      await page.waitForTimeout(20000);
      for (const angle of ['horizon', 'up']) {
        const pose = poses[`${zone}-${angle}`];
        await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(dest, `${zone}-${angle}.png`) });
      }
      const a = await cdp.send('Performance.getMetrics');
      await page.evaluate(() => { window.__skyReview.frames = []; });
      await page.waitForTimeout(5000);
      const b = await cdp.send('Performance.getMetrics');
      const frames = await page.evaluate(() => window.__skyReview.frames);
      const metric = (r, key) => r.metrics.find(m => m.name === key).value;
      const mean = key => frames.reduce((s, f) => s + f[key], 0) / frames.length;
      report.measurements.push({ zone, frames: frames.length, fps: 1000 / mean('ms'), calls: mean('calls'), triangles: mean('triangles'),
        cpuTaskMsPerSecond: (metric(b, 'TaskDuration') - metric(a, 'TaskDuration')) * 1000 / (metric(b, 'Timestamp') - metric(a, 'Timestamp')) });
      await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
      if (zone === 'last-postcard' || label === 'low' || zone === onlyZone) {
        report.timing = await page.evaluate(() => { const m = window.__skyReview; return { playableMs: m.playable - m.clicked }; });
        report.gpu = await world.locator('canvas').evaluate(c => { const gl = c.getContext('webgl2'), d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
        report.quality = await world.getAttribute('data-world-quality');
        throw done;
      }
    },
  } });
} catch (e) { if (e !== done) { report.errors.push(e.message); process.exitCode = 1; } }
finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
await writeFile(path.join(dest, onlyZone ? `${onlyZone}-report.json` : 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
