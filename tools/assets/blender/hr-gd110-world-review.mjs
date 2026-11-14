// node tools/assets/blender/hr-gd110-world-review.mjs before|A1|B1|B2|A2|low [url]
// Uses the shared review tool; A blocks only the new bike asset, all other settings identical.
import { mkdir, writeFile } from 'node:fs/promises';
import { captureIngame } from '../../review/ingame-shots.mjs';

const label = process.argv[2] ?? 'B1', output = `test-results/hr-gd110/world-${label}`;
await mkdir(output, { recursive: true });
const stop = new Error('vehicle review complete');
const report = { label, errors: [], requests: [], measurements: [] };
let cdp;
try {
  await captureIngame({ outDir: output, baseUrl: process.argv[3] ?? 'http://127.0.0.1:4198', showcase: {
    quality: label === 'low' ? 'low' : 'high',
    async onPage(page) {
      if (label.startsWith('A')) await page.route('**/world/vehicle/**', route => route.abort());
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('response', async response => {
        if (response.url().includes('/world/vehicle/')) report.requests.push({ url: response.url(), status: response.status() });
      });
      cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
      await page.addInitScript(() => {
        const data = { click: null, playable: null, frames: [], calls: 0, triangles: 0 };
        window.__hrBikeMetrics = data;
        document.addEventListener('click', event => {
          if (event.target.closest?.('button')?.textContent.trim() === 'Enter World') data.click = performance.now();
        }, true);
        new MutationObserver(() => {
          if (data.click !== null && data.playable === null && document.querySelector('[data-world-build="done"][data-world-intro="done"]')) data.playable = performance.now();
        }).observe(document, { subtree: true, childList: true, attributes: true });
        for (const [name, indexed, instanced] of [['drawElements', true, false], ['drawArrays', false, false], ['drawElementsInstanced', true, true], ['drawArraysInstanced', false, true]]) {
          const original = WebGL2RenderingContext.prototype[name];
          WebGL2RenderingContext.prototype[name] = function (...args) {
            data.calls++;
            if (args[0] === 4) data.triangles += args[indexed ? 1 : 2] / 3 * (instanced ? args[indexed ? 4 : 3] : 1);
            return original.apply(this, args);
          };
        }
        let last = performance.now();
        function sample(now) {
          if (data.calls) data.frames.push({ ms: now - last, calls: data.calls, triangles: data.triangles });
          last = now; data.calls = data.triangles = 0; requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
    },
    async onZone(page, world) {
      await world.evaluate(el => el.__tqaJourney.nearVehicle());
      await page.waitForTimeout(14000);
      const player = await world.evaluate(el => el.__tqaJourney.position());
      const anchor = [player.x - 1.2, player.y - .92, player.z];
      report.anchor = anchor;
      if (['before', 'B1', 'low'].includes(label)) {
        for (const [name, offset] of [['front', [0, 1, 3]], ['rear', [0, 1, -3]], ['side', [3, 1, 0]], ['three-quarter', [2.8, 1.1, 2.8]]]) {
          await world.evaluate((el, pose) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: pose })), {
            position: offset.map((v,i) => v + anchor[i]), target: [anchor[0], anchor[1] + .62, anchor[2]],
          });
          await page.waitForTimeout(800);
          await page.screenshot({ path: `${output}/${name}.png` });
        }
      }
      const measure = async kind => {
        const a = await cdp.send('Performance.getMetrics');
        await page.evaluate(() => { window.__hrBikeMetrics.frames = []; });
        await page.waitForTimeout(6000);
        const b = await cdp.send('Performance.getMetrics');
        const frames = await page.evaluate(() => window.__hrBikeMetrics.frames);
        const metric = (result,key) => result.metrics.find(m => m.name === key).value;
        const mean = key => frames.reduce((sum,f) => sum + f[key],0)/frames.length;
        report.measurements.push({ kind, samples: frames.length, fps: 1000/mean('ms'),
          calls: mean('calls'), triangles: mean('triangles'),
          cpuTaskMsPerSecond: (metric(b,'TaskDuration')-metric(a,'TaskDuration'))*1000/(metric(b,'Timestamp')-metric(a,'Timestamp')) });
      };
      await measure('parked');
      await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
      await world.locator('canvas').focus(); await page.keyboard.press('e');
      await page.waitForFunction(() => document.querySelector('[data-world-vehicle="manual"]'));
      await page.waitForTimeout(1000);
      await page.keyboard.down('w');
      await measure('driving');
      await page.screenshot({ path: `${output}/driving.png` });
      await page.keyboard.up('w');
      report.timing = await page.evaluate(() => {
        const m=window.__hrBikeMetrics;
        return { click:m.click, playable:m.playable, timeToPlayMs:m.playable-m.click,
          vehicleResources:performance.getEntriesByType('resource').filter(r=>r.name.includes('/world/vehicle/')).map(r=>({url:r.name,start:r.startTime,bytes:r.encodedBodySize})) };
      });
      report.gpu = await world.locator('canvas').evaluate(canvas => {
        const gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
      });
      report.quality = await world.getAttribute('data-world-quality');
      throw stop;
    },
  } });
} catch (error) { if (error !== stop) { report.errors.push(error.message); process.exitCode=1; } }
await writeFile(`${output}/report.json`, JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
