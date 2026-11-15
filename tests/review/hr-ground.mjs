// Matched production captures via the shared review tool. One hardware browser at a time.
// node tests/review/hr-ground.mjs before|after|low|A1|B1|B2|A2 [url]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { captureIngame } from '../../tools/review/ingame-shots.mjs';

const label = process.argv[2] ?? 'after', low = label === 'low';
const profile = /^[AB][12]$/.test(label);
const profileZone = process.env.HR_GROUND_PROFILE_ZONE ?? 'horizon';
const warmupMs = Number(process.env.HR_GROUND_WARMUP_MS ?? 20000);
const sampleMs = Number(process.env.HR_GROUND_SAMPLE_MS ?? (profile ? 12000 : 3000));
const onlyZones = process.env.HR_GROUND_ZONES?.split(',');
const directory = `test-results/hr-ground/${label}`;
await mkdir(directory, { recursive: true });
const poseFile = 'test-results/hr-ground/poses.json';
let poses;
if (label === 'before') {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true } });
  try {
    const { ZONES } = await vite.ssrLoadModule('/src/features/world/layout/zones.ts');
    const { surfaceHeight } = await vite.ssrLoadModule('/src/features/world/terrain/height.ts');
    const { nearestRiver, nearestPath } = await vite.ssrLoadModule('/src/features/world/terrain/samples.ts');
    poses = {};
    for (const zone of ZONES) {
      const river = nearestRiver(zone.position.x, zone.position.z);
      const nx = (zone.position.x - river.x) / river.distance, nz = (zone.position.z - river.z) / river.distance;
      let point = [zone.position.x + nx * 15, 0, zone.position.z + nz * 15];
      // Low grazing view of a gentle shoulder, with a larger patch behind it.
      if (zone.biome === 'coast-dusk') point = [zone.position.x - nx * 22, 0, zone.position.z - nz * 22 - 12];
      point[1] = surfaceHeight(point[0], point[2]);
      const camera = [point[0] - nx * 10, point[1] + 5.5, point[2] - nz * 10 + 5];
      camera[1] = Math.max(camera[1], surfaceHeight(camera[0], camera[2]) + 3);
      poses[zone.id] = { position: camera, target: [point[0], point[1] + .2, point[2]], pathDistance: nearestPath(point[0], point[2]).distance };
      if (zone.id === 'roots') poses[zone.id].position = [point[0], point[1] + 7, point[2] + 5];
      if (zone.id === 'last-postcard') poses[zone.id] = { position: [12, 5, -564], target: [20, .66, -570] };
      if (zone.id === 'horizon') {
        const x = zone.position.x + nx * 58, z = zone.position.z + nz * 58 - 40;
        poses['horizon-summit'] = { position: [x, surfaceHeight(x, z) + 5, z], target: [zone.position.x, zone.position.y, zone.position.z] };
      }
    }
    await writeFile(poseFile, JSON.stringify(poses, null, 2));
  } finally { await vite.close(); }
} else poses = JSON.parse(await readFile(poseFile, 'utf8'));

const report = { label, runtime: process.argv[3], viewport: [1600, 900], warmupMs, sampleMs, samples: [], errors: [] };
const complete = new Error('profile complete');
let cdp;
try {
  await captureIngame({ outDir: directory, baseUrl: process.argv[3], showcase: {
    quality: low ? 'low' : 'high',
    async onPage(page) {
      cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      await page.addInitScript(() => {
        const stats = window.__hrGround = { frames: [], calls: 0, triangles: 0, observe: true, click: null, playable: null };
        document.addEventListener('click', e => { if (e.target.closest?.('button')?.textContent.trim() === 'Enter World') stats.click = performance.now(); }, true);
        new MutationObserver(() => {
          if (stats.click !== null && stats.playable === null && document.querySelector('[data-world-intro="done"]')) stats.playable = performance.now();
        }).observe(document, { subtree: true, childList: true, attributes: true });
        const originals = new Map(), observers = new Map();
        for (const [name, count, instance] of [['drawElements', 1], ['drawArrays', 2], ['drawElementsInstanced', 1, 4], ['drawArraysInstanced', 2, 3]]) {
          const original = WebGL2RenderingContext.prototype[name]; originals.set(name, original);
          WebGL2RenderingContext.prototype[name] = function (...args) {
            stats.calls++; if (args[0] === 4) stats.triangles += args[count] / 3 * (instance === undefined ? 1 : args[instance]);
            return original.apply(this, args);
          };
          observers.set(name, WebGL2RenderingContext.prototype[name]);
        }
        window.__hrGroundSetObserver = enabled => {
          for (const [name, method] of enabled ? observers : originals) WebGL2RenderingContext.prototype[name] = method;
          stats.observe = enabled;
        };
        let last = performance.now();
        requestAnimationFrame(function tick(now) {
          if (!stats.observe || stats.calls) stats.frames.push({ ms: now - last, calls: stats.calls, triangles: stats.triangles });
          last = now; stats.calls = stats.triangles = 0; requestAnimationFrame(tick);
        });
      });
    },
    async onZone(page, world, zone) {
      if ((profile || low) && zone === 'first-light') {
        const destination = low ? 'horizon' : profileZone;
        await world.evaluate((el, id) => el.__tqaJourney.goTo(id), destination);
        zone = destination;
      }
      if (onlyZones && !onlyZones.includes(zone)) return;
      if ((profile && zone !== profileZone) || (low && zone !== 'horizon')) return;
      await page.waitForTimeout(low ? 3000 : warmupMs);
      const views = zone === 'horizon' && !profile && !low ? [zone, 'horizon-summit'] : [zone];
      for (const view of views) {
        const pose = poses[view];
        await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
        await page.waitForTimeout(2000);
        if (await world.getAttribute('data-world-quality') !== (low ? 'low' : 'high')) throw new Error('Quality changed');
        await world.locator('canvas').screenshot({ path: `${directory}/${view}.png` });
        await page.evaluate(() => { window.__hrGround.frames = []; });
        await page.waitForTimeout(1500);
        const draws = await page.evaluate(() => {
          const f = window.__hrGround.frames;
          return { calls: f.reduce((n, v) => n + v.calls, 0) / f.length, triangles: f.reduce((n, v) => n + v.triangles, 0) / f.length };
        });
        // ABBA uses native draw methods during its CPU/FPS window.
        if (profile) await page.evaluate(() => window.__hrGroundSetObserver(false));
        const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        await page.evaluate(() => { window.__hrGround.frames = []; });
        const a = await metrics(); await page.waitForTimeout(sampleMs); const b = await metrics();
        const sample = await page.evaluate(() => {
          const frames = window.__hrGround.frames;
          const canvas = document.querySelector('canvas'), gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
          return { fps: 1000 * frames.length / frames.reduce((n, f) => n + f.ms, 0), frames: frames.length,
            gpu: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), glError: gl.getError(),
            focused: document.hasFocus(), visibility: document.visibilityState,
            paused: document.querySelector('[data-world-build]')?.getAttribute('data-world-paused'), contextLost: gl.isContextLost(),
            playableMs: window.__hrGround.playable - window.__hrGround.click,
            resources: performance.getEntriesByType('resource').filter(r => /\/world\/tex\//.test(r.name)).map(r => ({ url: r.name, bytes: r.encodedBodySize, startMs: r.startTime - window.__hrGround.click })) };
        });
        if (sample.glError || sample.contextLost || sample.paused !== 'false' || !sample.focused || sample.visibility !== 'visible') throw new Error('Invalid GPU/focus sample');
        if (profile) await page.evaluate(() => window.__hrGroundSetObserver(true));
        report.samples.push({ zone: view, pose, ...draws, ...sample, observer: !profile,
          cpuTaskMsPerSecond: 1000 * (b.TaskDuration - a.TaskDuration) / (b.Timestamp - a.Timestamp),
          cpuScriptMsPerSecond: 1000 * (b.ScriptDuration - a.ScriptDuration) / (b.Timestamp - a.Timestamp) });
        await writeFile(`${directory}/metrics.json`, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ zone: view, ...draws, fps: sample.fps, gpu: sample.gpu }));
      }
      await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
      if (profile || low) throw complete;
    },
  } });
} catch (error) { if (error !== complete) { report.failure = error.message; throw error; } }
finally { await writeFile(`${directory}/metrics.json`, JSON.stringify(report, null, 2)); }
if (report.errors.length) throw new Error(report.errors.join('\n'));
