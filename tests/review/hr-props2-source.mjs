// Source smoke before the single production build. No shipped instrumentation.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { meanLuma, sharp } from '../../tools/review/luma.mjs';
const results = process.env.HR_PROPS_RESULTS ?? 'test-results/hr-props2';
const reference = process.env.HR_PROPS_REFERENCE ?? results;
const sourceDir = `${results}/source`;
await mkdir(sourceDir, { recursive: true });
const html = '<!doctype html><link rel="icon" href="data:,"><style>html,body,#world{width:100%;height:100%;margin:0;overflow:hidden}canvas{display:block}</style><div id="world" class="world-viewport" tabindex="0"></div><script type="module">import {mountWorld} from "/src/features/world/index.ts";window.__disposeWorld=await mountWorld(document.getElementById("world"),{locale:"en",quality:"high",debug:true});</script>';
const server = await createServer({ configFile: false, cacheDir: `${results}/.vite`, define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [{ name: 'hr-props-inspect', enforce: 'pre', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url === '/__hr-props2-source.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
      if (req.url !== '/en/world-content.json') return next();
      res.setHeader('content-type', 'application/json'); res.end(await readFile('out/en/world-content.json'));
    });
  }, transform(source, id) {
    if (id.replaceAll('\\', '/').endsWith('/world/index.ts')) return source
      .replace('const scene = new Scene();', 'const scene = new Scene(); globalThis.__hrScene = scene;')
      .replace('const camera = new PerspectiveCamera(55, 1, 0.1, 100);', 'const camera = new PerspectiveCamera(55, 1, 0.1, 100); globalThis.__hrCamera = camera;')
      .replace('const paper = paperPass;', 'const paper = paperPass; globalThis.__hrPaper = paper;')
      .replace('renderer = new WebGLRenderer({ antialias: true });', 'renderer = new WebGLRenderer({ antialias: true }); globalThis.__hrRenderer = renderer;');
    if (id.replaceAll('\\', '/').endsWith('/props/hr-structures.ts')) return source.replace('const before = mesh.onBeforeRender', '(globalThis.__structureMeshes ??= []).push(mesh); const before = mesh.onBeforeRender');
    if (!id.replaceAll('\\', '/').endsWith('/props/hr-props.ts')) return;
    return source.replace('const fallback = mesh.geometry, empty', '(globalThis.__propsMeshes ??= []).push(mesh); const fallback = mesh.geometry, empty');
  } }], server: { host: '127.0.0.1', port: 4201, strictPort: true,
    watch: { ignored: ['**/tmp/**', '**/src/**', '**/tests/**', '**/tools/**', '**/test-results/**'] } } }); await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const errors = [], samples = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto('http://127.0.0.1:4201/__hr-props2-source.html');
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await page.locator('canvas').waitFor({ timeout: 120000 }); await page.bringToFront(); await page.locator('canvas').focus();
  await world.waitFor({ timeout: 180000 }); await world.locator('canvas').focus();
  await world.evaluate(e => e.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'high' } })));
  for (const zone of (process.env.HR_PROPS_SMOKE_ZONES?.split(',') ?? ['workshop', 'milestones', 'old-trail', 'horizon', 'quiet-shore', 'last-postcard'])) {
    await world.evaluate(async (e, zone) => e.__tqaJourney.goTo(zone), zone);
    await world.evaluate(e => e.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'high' } })));
    const baseline = JSON.parse(await readFile(`${reference}/before/metrics.json`, 'utf8'));
    await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), baseline.samples.find(s => s.zone === zone).pose);
    await page.waitForTimeout(35000);
    const state = await page.evaluate(() => (window.__propsMeshes ?? []).map(m => ({ name: m.name, ready: m.userData.hrPropsReady, error: m.userData.hrPropsError, children: m.children.flatMap(g => g.children.map(c => c.name)) })));
    const fps = await page.evaluate(() => new Promise(resolve => {
      const start = performance.now(); let frames = 0;
      requestAnimationFrame(function frame(now) {
        frames++;
        if (now - start >= 5000) resolve(frames * 1000 / (now - start));
        else requestAnimationFrame(frame);
      });
    }));
    samples.push({ zone, fps, quality: await world.getAttribute('data-world-quality'), state }); console.log(JSON.stringify({ zone, fps, quality: samples.at(-1).quality, ready: state.filter(m => m.ready).length, failed: state.filter(m => m.error) }));
    const draws = await page.evaluate(() => new Promise(resolve => {
      const hooks = [], draws = [];
      window.__hrScene.traverse(mesh => {
        if (!mesh.isMesh) return;
        const before = mesh.onBeforeRender;
        hooks.push(() => { mesh.onBeforeRender = before; });
        mesh.onBeforeRender = function (...args) {
          before.apply(this,args);
          draws.push({ name: mesh.name || mesh.parent?.name, triangles: Math.min(mesh.geometry.drawRange.count,mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0)/3*(mesh.isInstancedMesh ? mesh.count : 1) });
        };
      });
      requestAnimationFrame(() => requestAnimationFrame(() => { hooks.forEach(restore => restore()); resolve(draws.sort((a,b) => b.triangles-a.triangles).slice(0,30)); }));
    }));
    samples.at(-1).draws = draws;
    if (process.env.HR_PROPS_DWELL) {
      samples.at(-1).dwell = [];
      for (let window = 0; window < 6; window++) {
        const observation = await page.evaluate(() => new Promise(resolve => {
          const start = performance.now(), gaps = []; let previous = start;
          requestAnimationFrame(function frame(now) {
            gaps.push(now-previous); previous = now;
            if (now-start < 5000) return requestAnimationFrame(frame);
            const resources = performance.getEntriesByType('resource').filter(r => r.name.includes('/world/lib/'));
            const lastEnd = Math.max(0,...resources.map(r => r.startTime+r.duration));
            gaps.sort((a,b) => a-b);
            resolve({ at: now, fps: gaps.length*1000/(now-start), p95Ms: gaps[Math.floor(gaps.length*.95)], resourceCount: resources.length,
              resourceQuietMs: now-lastEnd, textures: globalThis.__hrRenderer.info.memory.textures, geometries: globalThis.__hrRenderer.info.memory.geometries });
          });
        }));
        samples.at(-1).dwell.push(observation); console.log(JSON.stringify({ zone, window, observation }));
      }
    }
    if (process.env.HR_PROPS_GPU) {
      const gpu = await page.evaluate(async () => {
        const renderer = window.__hrRenderer, gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (!ext) return { error: 'GPU timer queries unavailable' };
        const original = renderer.renderBufferDirect, records = [];
        renderer.renderBufferDirect = function (...args) {
          const query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          try { return original.apply(this,args); }
          finally { gl.endQuery(ext.TIME_ELAPSED_EXT); records.push({ query, name: `${args[4].name || args[4].parent?.name}/${args[3].name}` }); }
        };
        try { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
        finally { renderer.renderBufferDirect = original; }
        gl.finish();
        for (let attempt = 0; attempt < 100 && records.length && !gl.getQueryParameter(records.at(-1).query, gl.QUERY_RESULT_AVAILABLE); attempt++) await new Promise(resolve => setTimeout(resolve,10));
        const groups = new Map();
        for (const record of records) {
          const ns = gl.getQueryParameter(record.query,gl.QUERY_RESULT);
          groups.set(record.name,(groups.get(record.name) ?? 0)+ns/1e6); gl.deleteQuery(record.query);
        }
        const timings = [...groups].map(([name,milliseconds]) => ({ name,milliseconds })).sort((a,b) => b.milliseconds-a.milliseconds);
        return { disjoint: gl.getParameter(ext.GPU_DISJOINT_EXT), draws: records.length, valid: timings.some(t => t.milliseconds > 0), groups: timings };
      });
      samples.at(-1).gpu = gpu;
      console.log(JSON.stringify({ zone, gpu }));
    }
    if (process.env.HR_PROPS_SORT_EXPERIMENT) {
      const experiment = await page.evaluate(() => {
        const scene = window.__hrScene, camera = window.__hrCamera, renderer = window.__hrRenderer, gl = renderer.getContext();
        const leaves = [], original = new Map();
        scene.traverse(mesh => { if (mesh.isInstancedMesh && (mesh.material.name === 'hr-tree2-leaf' || mesh.material.name === 'hr-props-photographic-pbr' && mesh.material.alphaTest > 0)) { leaves.push(mesh); original.set(mesh,mesh.renderOrder); } });
        const samples = [];
        const render = () => { renderer.shadowMap.needsUpdate = true; window.__hrPaper.render(scene,camera); };
        try {
          for (const label of ['A1','B1','B2','A2']) {
            for (const mesh of leaves) {
              const center = (mesh.boundingSphere ?? mesh.geometry.boundingSphere)?.center;
              mesh.renderOrder = label.startsWith('B') && center ? 1+center.clone().applyMatrix4(mesh.matrixWorld).distanceTo(camera.position) : original.get(mesh);
            }
            for (let i = 0; i < 3; i++) render(); gl.finish();
            const start = performance.now();
            for (let i = 0; i < 12; i++) render(); gl.finish();
            samples.push({ label, wallMsPerRender: (performance.now()-start)/12 });
          }
        } finally { for (const mesh of leaves) mesh.renderOrder = original.get(mesh); }
        return { method: '12 fixed-scene full post renders per sample, gl.finish; shadow update forced equally; no rAF/display cap; A=original, B=depth-ordered opaque cutouts', leaves: leaves.length, samples };
      });
      samples.at(-1).sortExperiment = experiment; console.log(JSON.stringify({ zone, experiment }));
    }
    const screenshot = await page.screenshot({ path: `${sourceDir}/${zone}.png` });
    const luma = await meanLuma(await sharp(screenshot).extract({ left: 100, top: 100, width: 1400, height: 550 }).toBuffer());
    if (luma < 0.04 && process.env.HR_PROPS_DIAGNOSE) {
      const details = await page.evaluate(() => window.__structureMeshes.map(m => {
        const attrs = Object.fromEntries(Object.entries(m.geometry.attributes).map(([name, a]) => [name, { count: a.count, finite: Array.from(a.array).every(Number.isFinite) }]));
        const n = m.geometry.getAttribute('normal'), t = m.geometry.getAttribute('tangent');
        let zeroNormals = 0, badTangents = 0;
        for (let i = 0; i < (n?.count ?? 0); i++) {
          if (Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) < .01) zeroNormals++;
          if (t && Math.hypot(n.getY(i)*t.getZ(i)-n.getZ(i)*t.getY(i), n.getZ(i)*t.getX(i)-n.getX(i)*t.getZ(i), n.getX(i)*t.getY(i)-n.getY(i)*t.getX(i)) < .01) badTangents++;
        }
        return { name: m.name, material: m.material.name, attrs, zeroNormals, badTangents, flatShading: m.material.flatShading, normalType: m.material.normalMapType, normalChannel: m.material.normalMap?.channel, normalScale: m.material.normalScale?.toArray(), color: m.material.color?.toArray() };
      }));
      await writeFile(`${sourceDir}/black-details.json`, JSON.stringify(details, null, 2));
      for (const mode of ['object-space', 'zero-scale', 'flat', 'no-wood']) {
        await page.evaluate(mode => {
          for (const m of window.__structureMeshes) if (m.material.name === 'hr-structural-wood') {
            m.material.normalMapType = mode === 'object-space' ? 1 : 0;
            m.material.normalScale.setScalar(mode === 'zero-scale' ? 0 : .55);
            m.material.flatShading = mode === 'flat';
            if (mode === 'no-wood') m.material.normalMap = null;
            m.material.needsUpdate = true;
          }
        }, mode);
        await page.waitForTimeout(12000);
        await page.screenshot({ path: `${sourceDir}/${mode}.png` });
      }
    }
    if (luma < 0.04) throw new Error(`Black world frame at ${zone}: luma=${luma}`);
    if (zone === 'first-light' && !process.env.HR_PROPS_GPU && !process.env.HR_PROPS_SORT_EXPERIMENT && !process.env.HR_PROPS_DWELL) {
      const cameras = JSON.parse(await readFile(`${reference}/litter-detail-cameras.json`,'utf8'));
      for (const pose of cameras) {
        await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), { position: pose.position, target: pose.target });
        await page.waitForTimeout(10000); await page.screenshot({ path: `${sourceDir}/litter-${pose.index}.png` });
      }
    }
  }
  await page.evaluate(() => window.__disposeWorld());
} finally {
  await browser.close(); await server.close(); await writeFile(`${sourceDir}/report.json`, JSON.stringify({ errors, samples }, null, 2));
}
if (errors.length || samples.some(s => s.state.some(m => m.error))) throw new Error(JSON.stringify({ errors, samples }));
