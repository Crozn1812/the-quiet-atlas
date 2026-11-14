// node tests/review/hr-tree2-review.mjs before|after|low [url]
import { mkdir, writeFile } from 'node:fs/promises';
import { captureIngame } from '../../tools/review/ingame-shots.mjs';

const label = process.argv[2] ?? 'after', outDir = `test-results/hr-tree2/${label}`;
await mkdir(outDir, { recursive: true });
const metrics = { label, sessions: [], errors: [], requests: [], zones: [] };
const stop = new Error('four forest zones captured');
let cdp, clicked;
try {
  await captureIngame({ outDir, baseUrl: process.argv[3] ?? 'http://127.0.0.1:4196', showcase: {
    quality: label.startsWith('low') ? 'low' : 'high',
    async onPage(page) {
      cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      page.on('console', m => { if (m.type() === 'error') metrics.errors.push(m.text()); });
      page.on('request', r => { if (r.url().includes('/world/lib/hr-')) metrics.requests.push({ url: r.url(), sinceClick: performance.now() - clicked }); });
      await page.addInitScript(() => {
        const times = { clicked: null, playable: null }; window.__hrTimes = times;
        document.addEventListener('click', e => { if (e.target.closest?.('button')?.textContent.trim() === 'Enter World') times.clicked = performance.now(); }, true);
        new MutationObserver(() => {
          if (times.clicked !== null && times.playable === null && document.querySelector('.world-viewport[data-world-build="done"][data-world-intro="done"]')) times.playable = performance.now();
        }).observe(document, { subtree: true, childList: true, attributes: true });
        const stats = { calls: 0, triangles: 0, frames: [] }; window.__hrDraw = stats;
        for (const [name, indexed, instanced] of [['drawElements', true, false], ['drawArrays', false, false], ['drawElementsInstanced', true, true], ['drawArraysInstanced', false, true]]) {
          const original = WebGL2RenderingContext.prototype[name];
          WebGL2RenderingContext.prototype[name] = function (...args) {
            stats.calls++;
            if (args[0] === 4) stats.triangles += args[indexed ? 1 : 2] / 3 * (instanced ? args[4] ?? args[3] : 1);
            return original.apply(this, args);
          };
        }
        let last = performance.now();
        const frame = now => { if (stats.calls) stats.frames.push({ ms: now - last, calls: stats.calls, triangles: stats.triangles }); last = now; stats.calls = stats.triangles = 0; requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
      });
      page.on('request', r => { if (r.url().endsWith('/en/')) clicked = performance.now(); });
    },
    async onZone(page, world, zone) {
      if (!['first-light', 'workshop', 'roots', 'milestones'].includes(zone)) return;
      // Wait for streamed meshes; same delay and fixed poses for before/after.
      await page.waitForTimeout(18000);
      const position = await world.evaluate(e => e.__tqaJourney.position());
      for (const [shot, offset, target] of [
        ['near', [8, 3, 8], [9, 5, 0]], ['mid', [15, 8, 20], [0, 6, 0]], ['far', [45, 42, 58], [0, 8, 0]],
      ]) {
        await world.evaluate((e, pose) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail: pose })), {
          position: offset.map((v, i) => v + [position.x, position.y, position.z][i]),
          target: target.map((v, i) => v + [position.x, position.y, position.z][i]),
        });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${outDir}/${zone}-${shot}.png` });
      }
      const a = await cdp.send('Performance.getMetrics');
      await page.evaluate(() => { window.__hrDraw.frames = []; });
      await page.waitForTimeout(5000);
      const b = await cdp.send('Performance.getMetrics');
      const frames = await page.evaluate(() => window.__hrDraw.frames);
      const mean = key => frames.reduce((s, f) => s + f[key], 0) / frames.length;
      const elapsed = b.metrics.find(m => m.name === 'Timestamp').value - a.metrics.find(m => m.name === 'Timestamp').value;
      metrics.zones.push({ zone, position, quality: await world.getAttribute('data-world-quality'), calls: mean('calls'), triangles: mean('triangles'), fps: 1000 / mean('ms'), cpuTaskMsPerSecond: (b.metrics.find(m => m.name === 'TaskDuration').value - a.metrics.find(m => m.name === 'TaskDuration').value) * 1000 / elapsed });
      metrics.timing = await page.evaluate(() => window.__hrTimes);
      metrics.gpu = await world.locator('canvas').evaluate(canvas => {
        const gl = canvas.getContext('webgl2'), debug = gl?.getExtension('WEBGL_debug_renderer_info');
        return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable';
      });
      metrics.resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/world/lib/')).map(r => ({ name: r.name, startTime: r.startTime, bytes: r.encodedBodySize })));
      await world.evaluate(e => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
      if (zone === 'milestones' || process.env.HR_REVIEW_ONE === '1') throw stop;
    },
  } });
} catch (e) { if (e !== stop) { metrics.errors.push(e.message); process.exitCode = 1; } }
await writeFile(`${outDir}/metrics.json`, JSON.stringify(metrics, null, 2));
console.log(JSON.stringify({ label, errors: metrics.errors.length, zones: metrics.zones.length }));
