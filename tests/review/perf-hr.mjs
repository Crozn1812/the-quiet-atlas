// Local, serial hardware profile; no browser flags that select software WebGL.
// node tests/review/perf-hr.mjs before|after [production-url]
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const label = process.argv[2] ?? 'before', base = process.argv[3];
const gameplay = process.env.PERF_HR_GAMEPLAY === '1';
const directory = `test-results/perf-hr/${label}`;
await mkdir(directory, { recursive: true });
let server;
if (!base) {
  await mkdir('tmp/perf-hr', { recursive: true });
  await writeFile('tmp/perf-hr/index.html', '<!doctype html><link rel="icon" href="data:,"><style>html,body,#world{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><div id="world" class="world-viewport" tabindex="0"></div><script type="module" src="./main.js"></script>');
  await writeFile('tmp/perf-hr/main.js', "import {mountWorld} from '/src/features/world/index.ts'; await mountWorld(document.getElementById('world'),{locale:'en',quality:'high',debug:true});");
  server = await createServer({ configFile: false, cacheDir: 'node_modules/.cache/perf-hr',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    optimizeDeps: { exclude: ['three'] },
    plugins: [{ name: 'profile-draw-owner', enforce: 'pre', transform(source, id) {
      if (!/\/three\/(src\/renderers\/WebGLRenderer|build\/three.module)\.js/.test(id.replaceAll('\\', '/'))) return;
      return source.replace('this.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {',
        `this.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {
        globalThis.__drawOwner = [material.isMeshDepthMaterial || material.isMeshDistanceMaterial ? 'shadow' : camera.isOrthographicCamera && !scene?.isScene ? 'post' : 'color', object.name || object.parent?.name || material.name || material.type, material.name || material.type].join('|');`);
    } }], server: { host: '127.0.0.1', port: 4558, strictPort: true } });
  await server.listen();
}
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const report = { label, startedAt: new Date().toISOString(), source: base ?? 'Vite production-mode source', cameraMode: gameplay ? 'gameplay' : 'postcard', gpu: '', viewport: [], errors: [], samples: [] };
const baseline = label === 'before' ? null : JSON.parse(await readFile('test-results/perf-hr/before/metrics.json', 'utf8'));
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.addInitScript(() => {
    window.__tqaJourney = true; window.__tqaSkipIntro = true;
    const stats = { frames: [], draws: {}, calls: 0, triangles: 0 }; window.__hrProfile = stats;
    // Also attribute production bundles without modifying the export: depth
    // shader programs are shadows; identity orthographic/fullscreen programs post.
    const shaders = new WeakMap(), programs = new WeakMap(), uniforms = new WeakMap();
    let current;
    for (const name of ['shaderSource', 'attachShader', 'linkProgram', 'useProgram', 'getUniformLocation', 'uniformMatrix4fv']) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        if (name === 'shaderSource') shaders.set(args[0], args[1]);
        if (name === 'attachShader') { const program = programs.get(args[0]) ?? { shaders: [], pass: 'color' }; program.shaders.push(args[1]); programs.set(args[0], program); }
        if (name === 'linkProgram') {
          const program = programs.get(args[0]);
          if (program) {
            const source = program.shaders.map(shader => shaders.get(shader) ?? '').join('\n');
            if (/SHADER_TYPE Mesh(?:Depth|Distance)Material/.test(source)) program.pass = 'shadow';
            else if (!source.includes('modelViewMatrix')) program.pass = 'post';
          }
        }
        if (name === 'useProgram') current = programs.get(args[0]);
        if (name === 'uniformMatrix4fv' && uniforms.get(args[0]) === 'projectionMatrix' && current && current.pass !== 'shadow') {
          const matrix = args[2]; current.pass = matrix[0] === 1 && matrix[5] === 1 && matrix[15] === 1 ? 'post' : 'color';
        }
        const result = original.apply(this, args);
        if (name === 'getUniformLocation' && result) uniforms.set(result, args[1]);
        return result;
      };
    }
    for (const [name, countIndex, instancesIndex] of [['drawElements', 1], ['drawArrays', 2], ['drawElementsInstanced', 1, 4], ['drawArraysInstanced', 2, 3]]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        const triangles = args[0] === 4 ? args[countIndex] / 3 * (instancesIndex === undefined ? 1 : args[instancesIndex]) : 0;
        const key = window.__drawOwner ?? `${current?.pass ?? 'unattributed'}|production-program`;
        const entry = stats.draws[key] ??= { calls: 0, triangles: 0 };
        entry.calls++; entry.triangles += triangles; stats.calls++; stats.triangles += triangles;
        return original.apply(this, args);
      };
    }
    let last = performance.now();
    requestAnimationFrame(function frame(now) {
      if (stats.calls) stats.frames.push({ ms: now - last, calls: stats.calls, triangles: stats.triangles, draws: stats.draws });
      last = now; stats.calls = 0; stats.triangles = 0; stats.draws = {};
      requestAnimationFrame(frame);
    });
  });
  await page.goto(base ? `${base}/en/` : 'http://127.0.0.1:4558/tmp/perf-hr/index.html');
  if (base) await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor(); await page.bringToFront(); await world.locator('canvas').focus();
  report.gpu = await world.locator('canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info'); return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
  console.log(report.gpu);
  for (const size of (process.env.PERF_HR_QUICK ? [[1600, 900]] : [[1600, 900], [1920, 1080]])) {
    await page.setViewportSize({ width: size[0], height: size[1] }); report.viewport.push(size);
    for (const quality of (process.env.PERF_HR_QUICK ? ['high'] : ['high', 'balanced', 'low'])) {
      await world.evaluate((el, quality) => el.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality } })), quality);
      for (const zone of ['first-light', 'roots', 'workshop', 'quiet-shore']) {
        await world.evaluate(async (el, zone) => { el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })); await el.__tqaJourney.goTo(zone); }, zone);
        await page.waitForTimeout(2000);
        const position = await world.evaluate(el => el.__tqaJourney.position());
        // Fixed player-distance views, with the First Light camera facing the cliff/forest.
        let pose = gameplay ? null : (baseline ?? report).samples.find(s => s.zone === zone)?.pose;
        if (!pose && !gameplay) {
          const candidates = [];
          for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
            const view = { position: [position.x + Math.sin(angle) * 9, position.y + 3.5, position.z + Math.cos(angle) * 9], target: [position.x, position.y + 1, position.z] };
            await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), view);
            await page.waitForTimeout(6000);
            await page.evaluate(() => { window.__hrProfile.frames = []; });
            const begin = Date.now(); await page.waitForTimeout(2000);
            const frames = await page.evaluate(() => window.__hrProfile.frames.length);
            candidates.push({ pose: view, fps: frames * 1000 / (Date.now() - begin) });
          }
          candidates.sort((a, b) => a.fps - b.fps); pose = candidates[0].pose;
          (report.angleScan ??= []).push({ zone, candidates });
        }
        await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
        await page.bringToFront();
        const warmupMs = base ? quality === 'high' ? 45000 : quality === 'balanced' ? 25000 : 5000 : quality === 'low' ? 2500 : 18000;
        await page.waitForTimeout(warmupMs);
        if (quality === 'high') await world.locator('canvas').screenshot({ path: `${directory}/${size.join('x')}-${zone}.png` });
        await page.bringToFront(); await world.locator('canvas').focus();
        const startState = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus() }));
        await page.evaluate(() => { window.__hrProfile.frames = []; });
        const start = Date.now(); await page.waitForTimeout(5000); const seconds = (Date.now() - start) / 1000;
        const frames = await page.evaluate(() => window.__hrProfile.frames);
        const endState = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus() }));
        const owners = {};
        for (const frame of frames) for (const [name, draw] of Object.entries(frame.draws)) {
          const sum = owners[name] ??= { calls: 0, triangles: 0 }; sum.calls += draw.calls / frames.length; sum.triangles += draw.triangles / frames.length;
        }
        const sample = { size, zone, quality: await world.getAttribute('data-world-quality'), position, pose, warmupMs, startState, endState, frames: frames.length, seconds, fps: frames.length / seconds,
          calls: frames.reduce((n, f) => n + f.calls, 0) / frames.length, triangles: frames.reduce((n, f) => n + f.triangles, 0) / frames.length,
          owners: Object.fromEntries(Object.entries(owners).sort((a, b) => b[1].triangles - a[1].triangles)) };
        if (sample.quality !== quality || !frames.length) throw new Error(`Invalid ${zone} sample: expected ${quality}, got ${sample.quality}, ${frames.length} frames`);
        if ([startState, endState].some(state => state.visibility !== 'visible' || !state.focused)) throw new Error(`Invalid ${zone} sample: profiling browser lost focus or visibility`);
        report.samples.push(sample); console.log(JSON.stringify({ ...sample, owners: Object.entries(sample.owners).slice(0, 8) }));
        await writeFile(`${directory}/metrics.json`, JSON.stringify(report, null, 2));
      }
    }
  }
} finally { report.finishedAt = new Date().toISOString(); await browser.close(); await server?.close(); await writeFile(`${directory}/metrics.json`, JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ label, samples: report.samples.length, errors: report.errors.length }));
if (report.errors.length) { console.error(report.errors); process.exitCode = 1; }
