// Serial hardware capture, identical camera and warmup across A/B exports.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { captureIngame } from '../../tools/review/ingame-shots.mjs';
import { meanLuma, sharp } from '../../tools/review/luma.mjs';

const results = process.env.HR_PROPS_RESULTS ?? 'test-results/hr-props2';
const reference = process.env.HR_PROPS_REFERENCE ?? results;
const label = process.argv[2] ?? 'after', outDir = `${results}/${label}`;
const low = label.startsWith('low');
const report = { label, startedAt: new Date().toISOString(), buildId: (await readFile(`${process.env.HR_PROPS_BUILD_DIR ?? '.next'}/BUILD_ID`,'utf8')).trim(), samples: [], errors: [], failedRequests: [], resources: [] };
const baseline = JSON.parse(await readFile(`${reference}/before/metrics.json`, 'utf8'));
await mkdir(outDir, { recursive: true });
let cdp;
try { await captureIngame({ outDir, baseUrl: process.argv[3] ?? 'http://127.0.0.1:4198', showcase: {
  quality: low ? 'low' : 'high',
  async onPage(page) {
    cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
    if (process.env.HR_PROPS_FULLSCREEN === '1') {
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
    }
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    page.on('requestfailed', r => report.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
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
    if (low && zone !== 'horizon') return;
    const p = await world.evaluate(e => e.__tqaJourney.position());
    const pose = baseline?.samples.find(s => s.zone === zone)?.pose ?? { position: [p.x + 12, p.y + 5.5, p.z + 13], target: [p.x, p.y + 1, p.z] };
    await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
    await page.waitForTimeout(low ? 4000 : 25000);
    await page.bringToFront(); await world.locator('canvas').focus();
    const screenshot = await page.screenshot({ path: `${outDir}/${zone}.png` });
    const luma = await meanLuma(await sharp(screenshot).extract({ left: 100, top: 100, width: 1400, height: 550 }).toBuffer());
    if (luma < 0.04) throw new Error(`Black world frame at ${zone}: luma=${luma}`);
    await page.evaluate(() => { window.__propsProfile.frames = []; });
    const a = await cdp.send('Performance.getMetrics');
    const start = Date.now(); await page.waitForTimeout(5000); const seconds = (Date.now() - start) / 1000;
    const b = await cdp.send('Performance.getMetrics');
    const frames = await page.evaluate(() => window.__propsProfile.frames);
    const metric = (r, name) => r.metrics.find(m => m.name === name).value;
    const state = await page.evaluate(() => ({ focused: document.hasFocus(), visible: document.visibilityState }));
    const { bounds } = await cdp.send('Browser.getWindowForTarget');
    const buffer = await world.locator('canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'); return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }; });
    const sample = { zone, pose, luma, quality: await world.getAttribute('data-world-quality'), ...state, windowState: bounds.windowState, buffer,
      fps: frames.length / seconds, calls: frames.reduce((s, f) => s + f.calls, 0) / frames.length,
      triangles: frames.reduce((s, f) => s + f.triangles, 0) / frames.length,
      cpuMsPerSecond: 1000 * (metric(b, 'TaskDuration') - metric(a, 'TaskDuration')) / (metric(b, 'Timestamp') - metric(a, 'Timestamp')) };
    if (!frames.length || !state.focused || state.visible !== 'visible' || sample.quality !== (low ? 'low' : 'high')) throw new Error(`Invalid profile: ${JSON.stringify(sample)}`);
    if (process.env.HR_PROPS_FULLSCREEN === '1' && (bounds.windowState !== 'fullscreen' || buffer.width !== 1600 || buffer.height !== 900)) throw new Error(`Invalid fullscreen protocol: ${JSON.stringify({ bounds, buffer })}`);
    report.samples.push(sample); console.log(JSON.stringify(sample));
    report.gpu = await world.locator('canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info'); return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
    report.timing = await page.evaluate(() => window.__propsTiming);
    report.resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/world/lib/')).map(r => ({ url: r.name, start: r.startTime, bytes: r.encodedBodySize })));
    await writeFile(`${outDir}/metrics.json`, JSON.stringify(report, null, 2));
    if (process.env.HR_PROPS_REQUIRE_60 === '1' && sample.fps < 60) throw new Error(`High FPS window below 60: ${zone} ${sample.fps.toFixed(2)}`);
    await world.evaluate(e => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
  },
  async onComplete(page, world) {
    // Only the first final sweep needs the leaf macros. Repeated sweeps and
    // baseline captures finish at the coast without reloading the forest.
    if (label !== 'after') return;
    await world.evaluate(async e => e.__tqaJourney.goTo('first-light'));
    const p = await world.evaluate(e => e.__tqaJourney.position());
    const pose = { position: [p.x + 5, p.y + 0.4, p.z + 6], target: [p.x + 5, p.y - 1, p.z + 3] };
    await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
    await page.waitForTimeout(10000);
    await page.screenshot({ path: `${outDir}/first-light-litter-close.png` });
    await writeFile(`${outDir}/litter-camera.json`, JSON.stringify(pose, null, 2));
    if (label === 'after') {
      const cameras = JSON.parse(await readFile(`${reference}/litter-detail-cameras.json`,'utf8'));
      for (const pose of cameras) {
        await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), { position: pose.position, target: pose.target });
        await page.waitForTimeout(10000); await page.screenshot({ path: `${outDir}/litter-${pose.index}.png` });
      }
    }
  },
} }); } finally { await writeFile(`${outDir}/metrics.json`, JSON.stringify(report, null, 2)); }
if (report.errors.length) throw new Error(report.errors.join('\n'));
