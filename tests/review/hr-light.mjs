// Native Edge, fixed gameplay poses; uses the standard showcase entry flow.
// node tests/review/hr-light.mjs before|after|low [baseUrl]
import { mkdir, writeFile } from 'node:fs/promises';
import { captureIngame } from '../../tools/review/ingame-shots.mjs';

const label = process.argv[2] ?? 'after';
const baseline = label.includes("before"), low = label.includes("low");
const outDir = `test-results/hr-light/${label}`;
await mkdir(outDir, { recursive: true });
const metrics = { label, baseline, zones: [], errors: [] };
const stop = new Error('review complete');
let cdp;
try {
  await captureIngame({ outDir, baseUrl: process.argv[3] ?? 'http://127.0.0.1:4198', showcase: {
    quality: low ? 'low' : 'high',
    async onPage(page) {
      cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      page.on('console', m => { if (m.type() === 'error') metrics.errors.push(m.text()); });
      await page.addInitScript(() => {
        window.__lightTimes = {};
        document.addEventListener('click', e => {
          if (e.target.closest?.('button')?.textContent.trim() === 'Enter World') window.__lightTimes.click = performance.now();
        }, true);
        new MutationObserver(() => {
          if (window.__lightTimes.click && !window.__lightTimes.interactive && document.querySelector('[data-world-intro="done"][data-world-paused="false"] canvas')) window.__lightTimes.interactive = performance.now();
          if (window.__lightTimes.click && !window.__lightTimes.playable && document.querySelector('[data-world-build="done"][data-world-intro="done"]')) window.__lightTimes.playable = performance.now();
        }).observe(document, { subtree: true, childList: true, attributes: true });
        const stats = window.__lightDraw = { calls: 0, triangles: 0, frames: [] };
        for (const [name, indexed, instanced] of [['drawElements', true, false], ['drawArrays', false, false], ['drawElementsInstanced', true, true], ['drawArraysInstanced', false, true]]) {
          const original = WebGL2RenderingContext.prototype[name];
          WebGL2RenderingContext.prototype[name] = function (...args) {
            stats.calls++;
            if (args[0] === 4) stats.triangles += args[indexed ? 1 : 2] / 3 * (instanced ? args[indexed ? 4 : 3] : 1);
            return original.apply(this, args);
          };
        }
        let last = performance.now();
        const frame = now => {
          if (stats.calls) stats.frames.push({ ms: now - last, calls: stats.calls, triangles: stats.triangles });
          last = now; stats.calls = stats.triangles = 0; requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    },
    async onZone(page, world, zone) {
      if (!['first-light', 'roots', 'horizon'].includes(zone)) return;
      await page.evaluate(enabled => document.dispatchEvent(new CustomEvent("tqa:light-review", { detail: enabled })), !baseline);
      await page.waitForTimeout(10000);
      const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
      const a = await get();
      await page.evaluate(() => { window.__lightDraw.frames = []; });
      await page.waitForTimeout(5000);
      const b = await get();
      const frames = await page.evaluate(() => window.__lightDraw.frames);
      const mean = key => frames.reduce((s, f) => s + f[key], 0) / frames.length;
      metrics.zones.push({ zone, quality: await world.getAttribute('data-world-quality'), calls: mean('calls'), triangles: mean('triangles'), fps: 1000 / mean('ms'), cpuTaskMsPerSecond: (b.TaskDuration - a.TaskDuration) * 1000 / (b.Timestamp - a.Timestamp) });
      await page.screenshot({ path: `${outDir}/${zone}.png` });
      if (zone === 'roots' && process.argv.includes('--profile')) {
        metrics.rootsABBA = [];
        for (const enabled of [false, true, true, false]) {
          await page.evaluate(detail => document.dispatchEvent(new CustomEvent('tqa:light-review', { detail })), enabled);
          await page.waitForTimeout(2500);
          const start = await get();
          await page.evaluate(() => { window.__lightDraw.frames = []; });
          await page.waitForTimeout(4000);
          const end = await get(), samples = await page.evaluate(() => window.__lightDraw.frames);
          metrics.rootsABBA.push({ enabled, fps: samples.length / samples.reduce((s, f) => s + f.ms, 0) * 1000,
            cpuTaskMsPerSecond: (end.TaskDuration - start.TaskDuration) * 1000 / (end.Timestamp - start.Timestamp) });
        }
        for (const enabled of [false, true]) {
          await page.evaluate(detail => document.dispatchEvent(new CustomEvent('tqa:light-review', { detail })), enabled);
          await page.waitForTimeout(2000);
          await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
          await page.waitForTimeout(3000);
          const { profile } = await cdp.send('Profiler.stop');
          await writeFile(`${outDir}/roots-${enabled ? 'on' : 'off'}.cpuprofile`, JSON.stringify(profile));
          const nodes = new Map(profile.nodes.map(n => [n.id, n.callFrame])), totals = {};
          for (let i = 0; i < profile.samples.length; i++) {
            const frame = nodes.get(profile.samples[i]), key = `${frame.functionName || '(anonymous)'} ${frame.url.split('/').at(-1)}:${frame.lineNumber}`;
            totals[key] = (totals[key] ?? 0) + profile.timeDeltas[i] / 1000;
          }
          (metrics.profiles ??= []).push({ enabled, topSelfMs: Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 18) });
        }
        await page.evaluate(detail => document.dispatchEvent(new CustomEvent('tqa:light-review', { detail })), !baseline);
      }
      if (zone === 'roots') {
        const p = await world.evaluate(e => e.__tqaJourney.position());
        await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), {
          position: [p.x - 5, p.y + 2.4, p.z], target: [p.x - 29, p.y + 4.5, p.z + 12],
        });
        await page.waitForTimeout(4000);
        await page.screenshot({ path: `${outDir}/roots-sun.png` });
        await world.evaluate(e => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
      }
      if (!low && ['first-light', 'horizon'].includes(zone)) {
        const p = await world.evaluate(e => e.__tqaJourney.position());
        const pose = zone === 'first-light'
          ? { position: [p.x - 8, p.y + 2.6, p.z + 4], target: [p.x - 30, p.y + 3.5, p.z + 17] }
          : { position: [p.x + 4, p.y + 2.0, p.z + 3], target: [p.x + 30, p.y + 6, p.z - 20] };
        await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
        await page.waitForTimeout(5500);
        await page.screenshot({ path: `${outDir}/${zone === 'first-light' ? 'first-light-forest' : 'horizon-slope'}.png` });
        if (zone === 'first-light') {
          await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), {
            position: [p.x - 3, p.y + 2.6, p.z - 4], target: [p.x - 26, p.y + 3.5, p.z + 17],
          });
          await page.waitForTimeout(5500);
          await page.screenshot({ path: `${outDir}/first-light-rays.png` });
        }
        await world.evaluate(e => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
      }
      metrics.timing = await page.evaluate(() => window.__lightTimes);
      metrics.gpu = await world.locator('canvas').evaluate(canvas => {
        const gl = canvas.getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      metrics.bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((s, r) => s + r.encodedBodySize, 0));
      if (zone === 'horizon' || label.startsWith('low')) throw stop;
    },
  } });
} catch (e) { if (e !== stop) { metrics.errors.push(e.message); process.exitCode = 1; } }
await writeFile(`${outDir}/metrics.json`, JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics));
if (metrics.errors.length) process.exitCode = 1;
