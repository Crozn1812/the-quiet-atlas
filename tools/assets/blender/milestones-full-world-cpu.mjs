// Full world ABBA without a second Next build. Both variants mount the same
// world source (Rapier, post, terrain, SURF, character, dressing). A read-only
// Vite load hook substitutes ONLY the Milestones factory from pre-MS-C Git.
// No source/export/config file is modified by the substitution.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { Vector3 } from 'three';

const currentProfile = process.argv.includes('--profile-current');
const diagnostic = process.argv.includes('--diagnostic');
const profiling = currentProfile || process.argv.includes('--profile');
const output = diagnostic ? 'test-results/ms-c2/diagnostic' : currentProfile ? 'test-results/ms-c2/profile-current' : profiling ? 'test-results/ms-c2/profile' : 'test-results/ms-c2/full-world-source', directory = 'tmp/ms-c2/full-world';
await mkdir(output, { recursive: true }); await mkdir(directory, { recursive: true });
const revision = '00e1850^';
const baseline = execFileSync('git', ['show', `${revision}:src/features/world/zones/milestones.ts`], { encoding: 'utf8', windowsHide: true });
const targetId = path.resolve('src/features/world/zones/milestones.ts').replaceAll('\\', '/').toLowerCase();
await writeFile(`${directory}/viewer.html`, `<!doctype html><html><head><link rel="icon" href="data:,"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden}#world{width:100%;height:100%;position:relative}canvas{display:block}
[data-world-interaction-hint],[data-hud-keys]{visibility:hidden}
</style></head><body><div id="world" tabindex="0"></div><script type="module" src="./viewer.js"></script></body></html>`);
await writeFile(`${directory}/viewer.js`, `import { mountWorld } from '/src/features/world/index.ts';
const container=document.getElementById('world');
window.review={ready:false};
window.review.dispose=await mountWorld(container,{locale:'en',quality:'high'});
container.dispatchEvent(new CustomEvent('tqa:set-quality',{detail:{quality:'high'}}));
window.review.ready=true;
`);
const servers = [];
let baselineLoaded = false;
for (const [variant, port] of [['A', 4535], ['B', 4536]]) {
  const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: `node_modules/.cache/ms-c2-full-world-${variant}`,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [{ name: 'read-only-ms-comparison', enforce: 'pre', async load(id) {
      const normalized = id.split('?')[0].replaceAll('\\', '/').toLowerCase();
      if (variant === 'A' && normalized === targetId) {
        baselineLoaded = true;
        return `globalThis.__msCpuFactoryRevision=${JSON.stringify(revision)};\n${baseline}`;
      }
      if (diagnostic && normalized === path.resolve('src/features/world/index.ts').replaceAll('\\', '/').toLowerCase()) {
        const source = await readFile(id, 'utf8');
        return source.replace('const gpu = renderer;', `const gpu = renderer;
const diag = globalThis.__msDiag = {frames:0,draws:0,triangles:0,renderMs:0,mesh:{}};
const nativeRender = gpu.render.bind(gpu); let instrumented = false;
gpu.render = (scene,camera) => {
  const main = scene.children.length > 20;
  if(main && !instrumented) {
    const statue=scene.getObjectByName('milestones-walking-statue');
    if(statue) { instrumented=true;
      for(const node of statue.children) {
        const value=diag.mesh[node.name]={draws:0,drawMs:0,rays:0,rayMs:0}; let started=0;
        const before=node.onBeforeRender.bind(node), after=node.onAfterRender.bind(node), ray=node.raycast.bind(node);
        node.onBeforeRender=(...args)=>{started=performance.now();before(...args);};
        node.onAfterRender=(...args)=>{after(...args);value.draws++;value.drawMs+=performance.now()-started;};
        node.raycast=(...args)=>{const start=performance.now();ray(...args);value.rays++;value.rayMs+=performance.now()-start;};
      }
    }
  }
  const start=performance.now(); nativeRender(scene,camera); diag.renderMs+=performance.now()-start;
  if(main) diag.frames++; diag.draws+=gpu.info.render.calls;diag.triangles+=gpu.info.render.triangles;
};`);
      }
    } }],
    server: { host: '127.0.0.1', port, strictPort: true },
  });
  await server.listen(); servers.push(server);
}
const { placeZoneScenes } = await servers[1].ssrLoadModule('/src/features/world/zones/index.ts');
const { surfaceHeight } = await servers[1].ssrLoadModule('/src/features/world/scene/compose.ts');
const [zone] = placeZoneScenes(surfaceHeight, ['milestones']);
zone.group.updateMatrixWorld(true);
const statue = zone.group.getObjectByName('milestones-walking-statue');
const pose = {
  position: statue.localToWorld(new Vector3(Math.sin(.12) * 9, 4, Math.cos(.12) * 9)).toArray(),
  target: statue.localToWorld(new Vector3(0, 3, 0)).toArray(),
};
zone.dispose();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const errors = [], samples = [];
try {
  for (const [label, port] of (currentProfile ? [['B1',4536]] : profiling || diagnostic ? [['A1',4535],['B1',4536]] : [['A1', 4535], ['B1', 4536], ['B2', 4536], ['A2', 4535]])) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(120000);
      const requests = [];
      page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
      page.on('console', m => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
      page.on('request', r => { if (r.url().includes('/world/milestones/')) requests.push(r.url()); });
      await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
      // Compare equal work on high-refresh displays. The uncapped diagnostic
      // observed A=73 fps and B=96 fps, making raw ms/s incomparable. This cap
      // belongs only to the reviewer; no production world source is changed.
      await page.addInitScript(() => {
        const nativeRAF = window.requestAnimationFrame.bind(window);
        const pending = new Map(); let sequence = 0, scheduled = false, previous = -Infinity;
        window.__msCadence = { frames: 0, hz: 60 };
        function pump(now) {
          scheduled = false;
          if (!pending.size) return;
          if (previous === -Infinity) previous = now - 1000 / 60;
          if (now - previous >= 1000 / 60 - .25) {
            previous += 1000 / 60 * Math.max(1, Math.floor((now - previous + .25) / (1000 / 60)));
            window.__msCadence.frames++;
            const callbacks = [...pending.values()]; pending.clear();
            for (const callback of callbacks) callback(now);
          }
          if (pending.size && !scheduled) { scheduled = true; nativeRAF(pump); }
        }
        window.requestAnimationFrame = callback => {
          const id = ++sequence; pending.set(id, callback);
          if (!scheduled) { scheduled = true; nativeRAF(pump); }
          return id;
        };
        window.cancelAnimationFrame = id => { pending.delete(id); };
      });
      await page.goto(`http://127.0.0.1:${port}/${directory}/viewer.html`);
      await page.waitForFunction(() => window.review?.ready);
      const world = page.locator('#world[data-world-build="done"][data-world-intro="done"]'); await world.waitFor();
      await page.bringToFront(); await world.locator('canvas').focus();
      await world.evaluate(el => el.__tqaJourney.goTo('milestones'));
      await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'high' } })));
      const distance = () => world.evaluate((el, target) => { const p = el.__tqaJourney.position(); return Math.hypot(p.x - target[0], p.z - target[2]); }, pose.target);
      let previous = await distance(), key = 'w';
      for (let step = 0; previous > 11 && step < 12; step++) {
        await page.keyboard.down(key); await page.waitForTimeout(500); await page.keyboard.up(key);
        const next = await distance(); if (next > previous + .2) key = key === 'w' ? 's' : 'w'; previous = next;
      }
      assert(previous <= 12, `${label}: player distance ${previous}`);
      await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
      // The same 15 s settling period lets IBL, GLB and all deferred LODs finish.
      await page.waitForTimeout(15000);
      const status = await world.evaluate(el => ({ quality: el.dataset.worldQuality, paused: el.dataset.worldPaused,
        revision: globalThis.__msCpuFactoryRevision ?? 'workspace', position: el.__tqaJourney.position() }));
      assert.equal(status.quality, 'high'); assert.equal(status.paused, 'false');
      if (label[0] === 'A') assert.equal(status.revision, revision);
      else assert(requests.length > 0, 'Current deferred sculpture must load');
      await page.screenshot({ path: `${output}/${label}.png` });
      const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
      const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
      if (profiling) {
        await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); await page.waitForTimeout(4000);
        const { profile } = await cdp.send('Profiler.stop');
        await writeFile(`${output}/${label}.cpuprofile`, JSON.stringify(profile));
      }
      if(diagnostic) await page.evaluate(()=>{const d=globalThis.__msDiag;for(const k of ['frames','draws','triangles','renderMs']) d[k]=0;for(const v of Object.values(d.mesh))for(const k of Object.keys(v))v[k]=0;});
      const firstFrame = await page.evaluate(()=>window.__msCadence.frames);
      const start = await metrics(); await page.waitForTimeout(10000); const end = await metrics(), seconds = end.Timestamp - start.Timestamp;
      const frames = await page.evaluate(()=>window.__msCadence.frames) - firstFrame;
      const sample = { label, seconds, scriptMsPerSecond: (end.ScriptDuration - start.ScriptDuration) * 1000 / seconds,
        taskMsPerSecond: (end.TaskDuration - start.TaskDuration) * 1000 / seconds, frames, fps: frames / seconds,
        scriptMsAt60fps: (end.ScriptDuration - start.ScriptDuration) * 1000 / frames * 60,
        playerDistance: previous, status, requests };
      if(diagnostic) sample.diagnostic = await page.evaluate(()=>globalThis.__msDiag);
      samples.push(sample); console.log(JSON.stringify(sample));
    } finally { await context.close(); }
  }
  if (profiling || diagnostic) {
    await writeFile(`${output}/samples.json`,JSON.stringify({samples,errors},null,2));
    console.log('Diagnostic data saved; no acceptance result.');
  } else {
  const mean = prefix => samples.filter(s => s.label[0] === prefix).reduce((sum, s) => sum + s.scriptMsPerSecond, 0) / 2;
  const delta = mean('B') - mean('A');
  const normalizedMean = prefix => samples.filter(s => s.label[0] === prefix).reduce((sum,s)=>sum+s.scriptMsAt60fps,0)/2;
  const normalizedDelta = normalizedMean('B') - normalizedMean('A');
  const cadencePass = samples.every(s=>s.fps >= 58 && s.fps <= 61);
  const report = { revision, samples, delta, normalizedDelta, cadencePass, baselineLoaded, errors,
    pass: baselineLoaded && errors.length === 0 && cadencePass && delta <= 10 && normalizedDelta <= 10,
    scope: 'Complete current world source, identical Rapier/post/SURF/terrain/character/environment/dressing; only milestones.ts substituted by pre-MS-C factory in read-only Vite hook for A. Reviewer-only 60 Hz cadence, >=58 fps in every sample; both raw and 60-fps-normalized deltas must be <=10 ms/s. Production source and the single Next build are untouched.' };
  await writeFile(`${output}/abba.json`, JSON.stringify(report, null, 2));
  assert(report.pass, `Full world source ABBA: ${delta.toFixed(2)} ms/s, errors: ${errors.join('; ')}`);
  console.log(`PASS: full world source ABBA ${delta.toFixed(2)} ms/s <= +10 ms/s`);
}
} finally { await browser.close(); for (const server of servers) await server.close(); }
