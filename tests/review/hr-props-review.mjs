// Serial hardware capture, identical camera and warmup across A/B exports.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { captureIngame } from '../../tools/review/ingame-shots.mjs';

const label = process.argv[2] ?? 'after', outDir = `test-results/hr-props/${label}`;
const low = label.startsWith('low');
const report = { label, samples: [], errors: [], resources: [] };
const baseline = label === 'before' ? null : JSON.parse(await readFile('test-results/hr-props/before/metrics.json', 'utf8'));
await mkdir(outDir, { recursive: true });
let cdp;
await captureIngame({ outDir, baseUrl: process.argv[3] ?? 'http://127.0.0.1:4198', showcase: {
  quality: low ? 'low' : 'high',
  async onPage(page) {
    cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.addInitScript(() => {
      const stats = { frames: [], calls: 0, triangles: 0 }; window.__propsProfile = stats;
      const timing = { clicked: null, playable: null }; window.__propsTiming = timing;
      document.addEventListener('click', e => { if (e.target.closest?.('button')?.textContent.trim() === 'Enter World') timing.clicked = performance.now(); }, true);
      new MutationObserver(() => {
        if (timing.clicked !== null && timing.playable === null && document.querySelector('[data-world-build="done"][data-world-intro="done"]')) timing.playable = performance.now();
      }).observe(document, { subtree: true, childList: true, attributes: true });
      for (const [name, count, instances] of [['drawElements', 1], ['drawArrays', 2], ['drawElementsInstanced', 1, 4], ['drawArraysInstanced', 2, 3]]) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function (...args) {
          stats.calls++; if (args[0] === 4) stats.triangles += args[count] / 3 * (instances === undefined ? 1 : args[instances]);
          return original.apply(this, args);
        };
      }
      requestAnimationFrame(function frame() {
        if (stats.calls) stats.frames.push({ calls: stats.calls, triangles: stats.triangles });
        stats.calls = stats.triangles = 0; requestAnimationFrame(frame);
      });
    });
  },
  async onZone(page, world, zone) {
    if (!['workshop', 'milestones', 'old-trail', 'horizon', 'quiet-shore', 'last-postcard'].includes(zone)) return;
    const p = await world.evaluate(e => e.__tqaJourney.position());
    const pose = baseline?.samples.find(s => s.zone === zone)?.pose ?? { position: [p.x + 12, p.y + 5.5, p.z + 13], target: [p.x, p.y + 1, p.z] };
    await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
    await page.waitForTimeout(low ? 4000 : 25000);
    await page.bringToFront(); await world.locator('canvas').focus();
    await page.screenshot({ path: `${outDir}/${zone}.png` });
    await page.evaluate(() => { window.__propsProfile.frames = []; });
    const a = await cdp.send('Performance.getMetrics');
    const start = Date.now(); await page.waitForTimeout(5000); const seconds = (Date.now() - start) / 1000;
    const b = await cdp.send('Performance.getMetrics');
    const frames = await page.evaluate(() => window.__propsProfile.frames);
    const metric = (r, name) => r.metrics.find(m => m.name === name).value;
    const state = await page.evaluate(() => ({ focused: document.hasFocus(), visible: document.visibilityState }));
    const sample = { zone, pose, quality: await world.getAttribute('data-world-quality'), ...state,
      fps: frames.length / seconds, calls: frames.reduce((s, f) => s + f.calls, 0) / frames.length,
      triangles: frames.reduce((s, f) => s + f.triangles, 0) / frames.length,
      cpuMsPerSecond: 1000 * (metric(b, 'TaskDuration') - metric(a, 'TaskDuration')) / (metric(b, 'Timestamp') - metric(a, 'Timestamp')) };
    if (!frames.length || !state.focused || state.visible !== 'visible' || sample.quality !== (low ? 'low' : 'high')) throw new Error(`Invalid profile: ${JSON.stringify(sample)}`);
    report.samples.push(sample); console.log(JSON.stringify(sample));
    report.gpu = await world.locator('canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info'); return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
    report.timing = await page.evaluate(() => window.__propsTiming);
    report.resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/world/lib/')).map(r => ({ url: r.name, start: r.startTime, bytes: r.encodedBodySize })));
    await writeFile(`${outDir}/metrics.json`, JSON.stringify(report, null, 2));
    await world.evaluate(e => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
  },
} });
if (report.errors.length) throw new Error(report.errors.join('\n'));
