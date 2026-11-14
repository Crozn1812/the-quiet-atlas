// Serial hardware review. Before/after use identical saved poses and the shared capture tool.
// node tests/review/hr-terrain-cliff.mjs before|after|low [export-url]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { captureIngame } from '../../tools/review/ingame-shots.mjs';

const label = process.argv[2] ?? 'after', low = label.split('/').at(-1) === 'low';
const profileOnly = process.env.HR_TERRAIN_PROFILE_ONLY === '1';
const springOnly = process.env.HR_TERRAIN_SPRING_ONLY === '1';
const complete = new Error('First Light profile complete');
const directory = `test-results/hr-terrain-cliff/${label}`;
await mkdir(directory, { recursive: true });
const poseFile = 'test-results/hr-terrain-cliff/poses.json';
let poses;
if (label === 'before') {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true } });
  try {
    const { ZONES } = await vite.ssrLoadModule('/src/features/world/layout/zones.ts');
    const { surfaceHeight } = await vite.ssrLoadModule('/src/features/world/terrain/height.ts');
    const { nearestPath } = await vite.ssrLoadModule('/src/features/world/terrain/samples.ts');
    poses = {};
    for (const zone of ZONES) {
      let best;
      for (let x = Math.floor(zone.position.x - 40); x < zone.position.x + 40; x += 2) {
        for (let z = Math.floor(zone.position.z - 40); z < zone.position.z + 40; z += 2) {
          const dx = (surfaceHeight(x + 1, z) - surfaceHeight(x - 1, z)) / 2;
          const dz = (surfaceHeight(x, z + 1) - surfaceHeight(x, z - 1)) / 2;
          const slope = Math.hypot(dx, dz), distance = nearestPath(x, z).distance;
          if (distance < 6 || distance > 40 || slope < .15 || (best && slope < best.slope)) continue;
          const nx = -dx / slope, nz = -dz / slope, y = surfaceHeight(x, z);
          best = { slope, point: [x, y, z], position: [x + nx * 11, y + 3, z + nz * 11], target: [x, y + .7, z] };
        }
      }
      if (best) poses[zone.id] = best;
    }
    // Same First Light cliff across the stream as HR-GD110 driving.png.
    poses['first-light'] = { position: [16, 10, 9], target: [-10, 15, -8] };
    await writeFile(poseFile, JSON.stringify(poses, null, 2));
  } finally { await vite.close(); }
} else poses = JSON.parse(await readFile(poseFile, 'utf8'));
const report = { label, samples: [], errors: [], timing: null };
const springViews = {
  'spring-ribbon': { position: [4, 9, 4], target: [-7, 12, -3] },
  'spring-west': { position: [-24, 12, 10], target: [-36, 17, -10] },
  'spring-central': { position: [4, 12, -4], target: [-14, 22, -29] },
  'spring-east': { position: [27, 13, -18], target: [-1, 22, -41] },
  'spring-end': { position: [38, 12, -35], target: [13, 18, -52] },
  'crest': { position: [17, 39, -20], target: [4, 39, -38] },
};
let cdp;
try { await captureIngame({ outDir: directory, baseUrl: process.argv[3] ?? 'http://127.0.0.1:4286', showcase: {
  quality: low ? 'low' : 'high',
  async onPage(page) {
    cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(`${message.text()} ${message.location().url}`); });
    await page.addInitScript(() => {
      const stats = window.__cliffReview = { frames: [], calls: 0, triangles: 0, click: null, playable: null };
      document.addEventListener('click', event => { if (event.target.closest?.('button')?.textContent.trim() === 'Enter World') stats.click = performance.now(); }, true);
      new MutationObserver(() => {
        if (stats.click !== null && stats.playable === null && document.querySelector('[data-world-build="done"][data-world-intro="done"]')) stats.playable = performance.now();
      }).observe(document, { subtree: true, childList: true, attributes: true });
      for (const [name, count, instances] of [['drawElements', 1], ['drawArrays', 2], ['drawElementsInstanced', 1, 4], ['drawArraysInstanced', 2, 3]]) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function (...args) {
          stats.calls++; if (args[0] === 4) stats.triangles += args[count] / 3 * (instances === undefined ? 1 : args[instances]);
          return original.apply(this, args);
        };
      }
      let last = performance.now();
      requestAnimationFrame(function frame(now) {
        if (stats.calls) stats.frames.push({ ms: now - last, calls: stats.calls, triangles: stats.triangles });
        last = now; stats.calls = stats.triangles = 0; requestAnimationFrame(frame);
      });
    });
  },
  async onZone(page, world, zone) {
    if (!poses[zone] || (low && zone !== 'first-light')) return;
    await page.waitForTimeout(low ? 3000 : 18000);
    await page.bringToFront(); await world.locator('canvas').focus();
    await world.evaluate((element, detail) => element.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), poses[zone]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${directory}/${zone}.png` });
    if (zone === 'first-light' && !low && !profileOnly) for (const [name, pose] of Object.entries(springViews)) {
      await world.evaluate((element, detail) => element.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
      await page.waitForTimeout(1500); await page.screenshot({ path: `${directory}/${name}.png` });
    }
    await world.evaluate((element, detail) => element.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), poses[zone]);
    await page.waitForTimeout(1000);
    const metric = result => Object.fromEntries(result.metrics.map(m => [m.name, m.value]));
    // A/B comparison runs can be invoked in A1 B1 B2 A2 order; no software GL flags.
    const a = metric(await cdp.send('Performance.getMetrics'));
    await page.evaluate(() => { window.__cliffReview.frames = []; });
    await page.waitForTimeout(profileOnly ? 12000 : 4000);
    const b = metric(await cdp.send('Performance.getMetrics'));
    const frames = await page.evaluate(() => window.__cliffReview.frames);
    const mean = key => frames.reduce((sum, frame) => sum + frame[key], 0) / frames.length;
    report.samples.push({ zone, pose: poses[zone], quality: await world.getAttribute('data-world-quality'),
      fps: 1000 / mean('ms'), calls: mean('calls'), triangles: mean('triangles'),
      cpuTaskMsPerSecond: 1000 * (b.TaskDuration - a.TaskDuration) / (b.Timestamp - a.Timestamp) });
    report.gpu = await world.locator('canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER); });
    report.timing = await page.evaluate(() => ({ playableMs: window.__cliffReview.playable - window.__cliffReview.click,
      resources: performance.getEntriesByType('resource').filter(r => /\/world\/(tex|lib|cliff)\//.test(r.name)).map(r => ({ url: r.name, bytes: r.encodedBodySize })) }));
    await writeFile(`${directory}/metrics.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.samples.at(-1)));
    // The final two serial ABBA runs also supply the paired production gallery.
    // Capture after sampling so changing cameras never enters the FPS/CPU window.
    if (profileOnly && /\/[AB]2$/.test(label)) for (const [name, pose] of Object.entries(springViews)) {
      await world.evaluate((element, detail) => element.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
      await page.waitForTimeout(1500); await page.screenshot({ path: `${directory}/${name}.png` });
    }
    await world.evaluate(element => element.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
    if (profileOnly || springOnly || low) throw complete;
  },
} }); } catch (error) { if (error !== complete) throw error; }
if (report.errors.length) throw new Error(report.errors.join('\n'));
