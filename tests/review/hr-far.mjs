// Local, serial hardware profile; no browser flags that select software WebGL.
// node tests/review/hr-far.mjs before|after [production-url]
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const label = process.argv[2] ?? 'before', base = process.argv[3];
const gameplay = process.env.PERF_HR_GAMEPLAY === '1';
const directory = `test-results/hr-far/${label}`;
await mkdir(directory, { recursive: true });
const baselineSource = process.env.HR_FAR_BASELINE === '1' ? execFileSync('git', ['show', 'HEAD:src/features/world/scene/far-landscape.ts'], { encoding: 'utf8' }) : null;
let server;
if (!base) {
  await mkdir('tmp/hr-far-source', { recursive: true });
  await writeFile('tmp/hr-far-source/index.html', '<!doctype html><link rel="icon" href="data:,"><style>html,body,#world{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><div id="world" class="world-viewport" tabindex="0"></div><script type="module" src="./main.js"></script>');
  await writeFile('tmp/hr-far-source/main.js', "import {mountWorld} from '/src/features/world/index.ts'; await mountWorld(document.getElementById('world'),{locale:'en',quality:'high',debug:true});");
  server = await createServer({ configFile: false, cacheDir: 'node_modules/.cache/hr-far',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    optimizeDeps: { exclude: ['three'] },
    plugins: [{ name: 'local-content', configureServer(server) { server.middlewares.use(async (req,res,next) => {
      if(req.url !== '/en/world-content.json') return next();
      try { res.setHeader('Content-Type','application/json'); res.end(await readFile('out/en/world-content.json')); } catch { next(); }
    }); } }, { name: 'far-baseline', enforce: 'pre', transform(source, id) {
      if (baselineSource && id.replaceAll('\\', '/').endsWith('/src/features/world/scene/far-landscape.ts')) return baselineSource;
      if (process.env.HR_FAR_DIAG === '1' && id.replaceAll('\\', '/').endsWith('/src/features/world/scene/far-landscape.ts')) {
        return source.replace('mesh.name = "far-landscape";', 'mesh.name = "far-landscape"; globalThis.__hrFar = mesh;')
          .replace('mesh.onBeforeRender = renderer => {', 'mesh.onBeforeRender = (renderer,scene,camera) => { globalThis.__farRender = {renderer,scene,camera};');
      }
    } }, { name: 'profile-draw-owner', enforce: 'pre', transform(source, id) {
      if (!/\/three\/(src\/renderers\/WebGLRenderer|build\/three.module)\.js/.test(id.replaceAll('\\', '/'))) return;
      return source.replace('this.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {',
        `this.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {
        globalThis.__drawOwner = [material.isMeshDepthMaterial || material.isMeshDistanceMaterial ? 'shadow' : camera.isOrthographicCamera && !scene?.isScene ? 'post' : 'color', object.name || object.parent?.name || material.name || material.type, material.name || material.type].join('|');`);
    } }], server: { host: '127.0.0.1', port: 4576, strictPort: true, hmr: false, watch: null } });
  await server.listen();
}
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const report = { label, startedAt: new Date().toISOString(), source: base ?? 'Vite production-mode source', runtime: base ? 'static export' : baselineSource ? 'HEAD baseline via Vite transform' : 'working tree', cameraMode: gameplay ? 'gameplay' : 'postcard', gpu: '', viewport: [], errors: [], samples: [] };
const baseline = label === 'before' ? null : JSON.parse(await readFile(process.env.HR_FAR_POSES ?? 'test-results/hr-far/before/metrics.json', 'utf8'));
try {
  const system=await browser.newBrowserCDPSession();
  report.processes=(await system.send('SystemInfo.getProcessInfo')).processInfo.map(({type,id,cpuTime})=>({type,id,cpuTime}));
  await system.detach();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('response', r => { if(r.status() >= 400) { (report.networkFailures ??= []).push({url:r.url(),status:r.status()}); console.log('HTTP',r.status(),r.url()); } });
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.addInitScript(() => {
    window.__tqaJourney = true; window.__tqaSkipIntro = true;
    const stats = { frames: [], draws: {}, calls: 0, triangles: 0 }; window.__hrProfile = stats;
    window.__hrContextLost = false;
    window.addEventListener('webglcontextlost', () => { window.__hrContextLost = true; }, true);
    const nativeMethods = new Map();
    // Also attribute production bundles without modifying the export: depth
    // shader programs are shadows; identity orthographic/fullscreen programs post.
    const shaders = new WeakMap(), programs = new WeakMap(), uniforms = new WeakMap();
    let current, activeProgram;
    const lensPrograms=new Map();
    const lensMatrix=(uniform,matrix)=>{
      const zoom=Math.tan(55*Math.PI/360)/Math.tan(20*Math.PI/360);
      const forward=['projectionMatrix','cameraProjectionMatrix'].includes(uniform) && matrix[15]===0;
      const inverse=['inverseProjection','cameraProjectionMatrixInverse'].includes(uniform);
      if (!forward && !inverse) return matrix;
      const adjusted=new Float32Array(matrix);
      adjusted[0]*=forward?zoom:1/zoom; adjusted[5]*=forward?zoom:1/zoom;
      return adjusted;
    };
    window.__hrSetTele=enabled=>{
      window.__hrTele=enabled;
      for(const [program,{gl,matrices}] of lensPrograms){
        // Quality/environment changes dispose old programs. Keeping their
        // matrices for review must not call useProgram on a deleted GL object.
        if(!gl.isProgram(program)||gl.getProgramParameter(program,gl.DELETE_STATUS)){
          lensPrograms.delete(program);continue;
        }
        const previous=gl.getParameter(gl.CURRENT_PROGRAM);
        nativeMethods.get('useProgram').call(gl,program);
        for(const [location,{uniform,matrix}] of matrices) nativeMethods.get('uniformMatrix4fv').call(gl,location,false,enabled?lensMatrix(uniform,matrix):matrix);
        nativeMethods.get('useProgram').call(gl,previous);
      }
    };
    for (const name of ['shaderSource', 'attachShader', 'linkProgram', 'useProgram', 'getUniformLocation', 'uniformMatrix4fv']) {
      const original = WebGL2RenderingContext.prototype[name];
      nativeMethods.set(name, original);
      WebGL2RenderingContext.prototype[name] = function (...args) {
        if (name === 'shaderSource') shaders.set(args[0], args[1]);
        if (name === 'attachShader') { const program = programs.get(args[0]) ?? { shaders: [], pass: 'color' }; program.shaders.push(args[1]); programs.set(args[0], program); }
        if (name === 'linkProgram') {
          const program = programs.get(args[0]);
          if (program) {
            const source = program.shaders.map(shader => shaders.get(shader) ?? '').join('\n');
            program.far = source.includes('float farCrown(') || source.includes('uniform float firstLightView;') && source.includes('vHrTint');
            if (/SHADER_TYPE Mesh(?:Depth|Distance)Material/.test(source)) program.pass = 'shadow';
            else if (!source.includes('modelViewMatrix')) program.pass = 'post';
          }
        }
        if (name === 'useProgram') { current = programs.get(args[0]); activeProgram=args[0]; }
        if (name === 'uniformMatrix4fv' && uniforms.get(args[0]) === 'projectionMatrix' && current && current.pass !== 'shadow') {
          const matrix = args[2]; current.pass = matrix[0] === 1 && matrix[5] === 1 && matrix[15] === 1 ? 'post' : 'color';
        }
        // Review-only tele lens. Change perspective and its inverse together,
        // including AO/aerial reconstruction; leave shadow/fullscreen matrices.
        if (name === 'uniformMatrix4fv') {
          const uniform=uniforms.get(args[0]), matrix=args[2];
          if(current?.pass!=='shadow'&&lensMatrix(uniform,matrix)!==matrix){
            const entry=lensPrograms.get(activeProgram)??{gl:this,matrices:new Map()};
            entry.matrices.set(args[0],{uniform,matrix:new Float32Array(matrix)}); lensPrograms.set(activeProgram,entry);
            if(window.__hrTele) args[2]=lensMatrix(uniform,matrix);
          }
        }
        const result = original.apply(this, args);
        if (name === 'getUniformLocation' && result) uniforms.set(result, args[1]);
        return result;
      };
    }
    for (const [name, countIndex, instancesIndex] of [['drawElements', 1], ['drawArrays', 2], ['drawElementsInstanced', 1, 4], ['drawArraysInstanced', 2, 3]]) {
      const original = WebGL2RenderingContext.prototype[name];
      nativeMethods.set(name, original);
      WebGL2RenderingContext.prototype[name] = function (...args) {
        if (window.__hrFarAblate && current?.far) return;
        const triangles = args[0] === 4 ? args[countIndex] / 3 * (instancesIndex === undefined ? 1 : args[instancesIndex]) : 0;
        const key = window.__drawOwner ?? `${current?.pass ?? 'unattributed'}|production-program`;
        const entry = stats.draws[key] ??= { calls: 0, triangles: 0 };
        entry.calls++; entry.triangles += triangles; stats.calls++; stats.triangles += triangles;
        return original.apply(this, args);
      };
    }
    const observedMethods = new Map([...nativeMethods.keys()].map(name => [name, WebGL2RenderingContext.prototype[name]]));
    window.__hrSetObserver = enabled => {
      for (const [name, method] of enabled ? observedMethods : nativeMethods) WebGL2RenderingContext.prototype[name] = method;
      window.__hrRafOnly = !enabled;
    };
    let last = performance.now();
    requestAnimationFrame(function frame(now) {
      if (stats.calls || window.__hrRafOnly) stats.frames.push({ ms: now - last, calls: stats.calls, triangles: stats.triangles, draws: stats.draws });
      last = now; stats.calls = 0; stats.triangles = 0; stats.draws = {};
      requestAnimationFrame(frame);
    });
  });
  await page.goto(base ? `${base}/en/` : 'http://127.0.0.1:4576/tmp/hr-far-source/index.html');
  const worldStart = Date.now();
  if (base) await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  await page.locator('[data-world-intro="done"]').waitFor();
  report.controlsReadyMs = Date.now() - worldStart;
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor(); report.worldReadyMs = Date.now() - worldStart; await page.bringToFront(); await world.locator('canvas').focus();
  report.gpu = await world.locator('canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info'); return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
  console.log(report.gpu);
  for (const size of [[1600, 900]]) {
    await page.setViewportSize({ width: size[0], height: size[1] }); report.viewport.push(size);
    for (const quality of (process.env.HR_FAR_QUALITIES?.split(',') ?? ['high', 'low'])) {
      await world.evaluate((el, quality) => el.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality } })), quality);
      for (const zone of (process.env.HR_FAR_ZONES?.split(',') ?? ['workshop', 'old-trail', 'horizon', 'milestones'])) {
        await world.evaluate(async (el, zone) => { el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })); await el.__tqaJourney.goTo(zone); }, zone);
        await page.waitForTimeout(2000);
        const position = await world.evaluate(el => el.__tqaJourney.position());
        // Fixed player-distance views, with the First Light camera facing the cliff/forest.
        let pose = gameplay ? null : (baseline ?? report).samples.find(s => s.zone === zone)?.pose;
        if (!pose && !gameplay) {
          pose = { position: [position.x + 8, position.y + 4.5, position.z + 11],
            target: [position.x - 120, position.y + 24, position.z - 130] };
        }
        await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
        await page.bringToFront();
        const warmupMs = Number(process.env.HR_FAR_WARMUP_MS) || (base ? quality === 'high' ? 45000 : quality === 'balanced' ? 25000 : 5000 : quality === 'low' ? 2500 : 18000);
        await page.waitForTimeout(warmupMs);
        if (process.env.HR_FAR_CPU_PROFILE === '1' && quality === 'high') {
          const session = await page.context().newCDPSession(page);
          await session.send('Profiler.enable'); await session.send('Profiler.start');
          await page.waitForTimeout(10000);
          const { profile } = await session.send('Profiler.stop'); await session.detach();
          await writeFile(`${directory}/${zone}.cpuprofile`, JSON.stringify(profile));
        }
        await world.locator('canvas').screenshot({ path: `${directory}/${size.join('x')}-${quality}-${zone}.png` });
        await page.bringToFront(); await world.locator('canvas').focus();
        const startState = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus() }));
        await page.evaluate(() => { window.__hrProfile.frames = []; });
        const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
        const getMetrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        const cpuA = await getMetrics(); const start = Date.now(); await page.waitForTimeout(5000); const seconds = (Date.now() - start) / 1000;
        const cpuB = await getMetrics(); await cdp.detach();
        const frames = await page.evaluate(() => window.__hrProfile.frames);
        const endState = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus() }));
        const owners = {};
        for (const frame of frames) for (const [name, draw] of Object.entries(frame.draws)) {
          const sum = owners[name] ??= { calls: 0, triangles: 0 }; sum.calls += draw.calls / frames.length; sum.triangles += draw.triangles / frames.length;
        }
        const sample = { size, zone, quality: await world.getAttribute('data-world-quality'), position, pose, warmupMs, startState, endState, frames: frames.length, seconds, fps: frames.length / seconds,
          calls: frames.reduce((n, f) => n + f.calls, 0) / frames.length, triangles: frames.reduce((n, f) => n + f.triangles, 0) / frames.length,
          cpuScriptMs: (cpuB.ScriptDuration - cpuA.ScriptDuration) * 1000 / seconds, cpuTaskMs: (cpuB.TaskDuration - cpuA.TaskDuration) * 1000 / seconds,
          owners: Object.fromEntries(Object.entries(owners).sort((a, b) => b[1].triangles - a[1].triangles)) };
        report.partialSample = sample;
        if (sample.quality !== quality || !frames.length) throw new Error(`Invalid ${zone} sample: expected ${quality}, got ${sample.quality}, ${frames.length} frames`);
        if ([startState, endState].some(state => state.visibility !== 'visible' || !state.focused)) throw new Error(`Invalid ${zone} sample: profiling browser lost focus or visibility`);
        if (process.env.HR_FAR_NATIVE_FPS === '1' && quality === 'high') {
          await page.evaluate(() => { window.__hrSetObserver(false); });
          await page.waitForTimeout(2000);
          const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
          const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name,m.value]));
          const state = () => page.evaluate(() => ({ visibility:document.visibilityState,focused:document.hasFocus(),
            paused:document.querySelector('[data-world-build]')?.getAttribute('data-world-paused'),contextLost:window.__hrContextLost }));
          const startState = await state();
          await page.evaluate(() => { window.__hrProfile.frames = []; });
          const a = await metrics(), started = Date.now(); await page.waitForTimeout(10000);
          const seconds = (Date.now()-started)/1000, b = await metrics();
          const frames = await page.evaluate(() => window.__hrProfile.frames.length), endState = await state();
          if ([startState,endState].some(s=>s.visibility!=='visible'||!s.focused||s.paused!=='false'||s.contextLost)) throw new Error('Invalid native FPS state');
          sample.native = { method:'Active app rAF cadence with all intercepted WebGL methods restored to native; geometry counts from preceding instrumented window',
            seconds, frames, fps:frames/seconds, cpuScriptMs:(b.ScriptDuration-a.ScriptDuration)*1000/seconds,
            cpuTaskMs:(b.TaskDuration-a.TaskDuration)*1000/seconds,startState,endState };
          await cdp.detach(); await page.evaluate(() => { window.__hrSetObserver(true); });
          console.log('NATIVE FPS', JSON.stringify({zone,...sample.native}));
        }
        if (process.env.HR_FAR_ABBA === '1' && quality === 'high' && zone === (process.env.HR_FAR_ABBA_ZONE ?? 'workshop')) {
          report.abba = [];
          const session = await page.context().newCDPSession(page); await session.send('Performance.enable');
          const metrics = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name,m.value]));
          for (const [label, skipFar] of [['A1',false],['B1',true],['B2',true],['A2',false]]) {
            await page.evaluate(skip => { window.__hrFarAblate = skip; }, skipFar);
            await page.waitForTimeout(2000);
            const stateA = await page.evaluate(() => ({visibility:document.visibilityState,focused:document.hasFocus()}));
            await page.evaluate(() => { window.__hrProfile.frames = []; });
            const a = await metrics(), started = Date.now(); await page.waitForTimeout(10000);
            const seconds = (Date.now()-started)/1000, b = await metrics();
            const frames = await page.evaluate(() => window.__hrProfile.frames);
            const stateB = await page.evaluate(() => ({visibility:document.visibilityState,focused:document.hasFocus()}));
            if ([stateA,stateB].some(s=>s.visibility!=='visible'||!s.focused)) throw new Error('ABBA lost focus');
            const row = {label,skipFar,seconds,frames:frames.length,fps:frames.length/seconds,
              calls:frames.reduce((n,f)=>n+f.calls,0)/frames.length,triangles:frames.reduce((n,f)=>n+f.triangles,0)/frames.length,
              cpuScriptMs:(b.ScriptDuration-a.ScriptDuration)*1000/seconds,cpuTaskMs:(b.TaskDuration-a.TaskDuration)*1000/seconds};
            report.abba.push(row); console.log('FAR ABBA',JSON.stringify(row));
          }
          await page.evaluate(() => { window.__hrFarAblate = false; }); await session.detach();
          await writeFile(`${directory}/metrics.json`,JSON.stringify(report,null,2));
        }
        sample.glBeforeTele = await world.locator('canvas').evaluate(canvas => canvas.getContext('webgl2').getError());
        if (sample.glBeforeTele !== 0) throw new Error(`WebGL error before tele ${zone}/${quality}: ${sample.glBeforeTele}`);
        if (quality === 'high') {
          const farPose = baseline?.samples.find(s => s.zone === zone && s.quality === quality)?.farPose
            ?? { position: [pose.position[0], pose.position[1] + 19.5, pose.position[2]], target: pose.target };
          await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), farPose);
          await page.waitForTimeout(1800);
          await world.locator('canvas').screenshot({ path: `${directory}/${size.join('x')}-high-${zone}-far.png` });
          if (process.env.HR_FAR_DIAG === '1') {
            const direct = await page.evaluate(() => {
              const {renderer,scene,camera}=window.__farRender;
              const target=renderer.getRenderTarget(); renderer.setRenderTarget(null); renderer.render(scene,camera);
              const url=renderer.domElement.toDataURL(); renderer.setRenderTarget(target); return url;
            });
            await writeFile(`${directory}/${zone}-direct.png`,Buffer.from(direct.split(',')[1],'base64'));
            const objects = await page.evaluate(() => {
              const entries=[];
              window.__farRender.scene.traverse(o=>{
                if (o.isMesh && /sea|sky|mist|far-landscape/i.test(o.name)) entries.push({
                  name:o.name,visible:o.visible,order:o.renderOrder,position:o.position.toArray(),
                  depthWrite:o.material?.depthWrite,transparent:o.material?.transparent});
              });
              return entries;
            });
            await writeFile(`${directory}/${zone}-objects.json`,JSON.stringify(objects,null,2));
            for (const kind of ['sea','sky','mist']) {
              await page.evaluate(kind=>{
                window.__hrHidden=[];
                window.__farRender.scene.traverse(o=>{
                  if(o.visible&&new RegExp(kind,'i').test(o.name)){window.__hrHidden.push(o);o.visible=false;}
                });
              },kind);
              await page.waitForTimeout(500);
              await world.locator('canvas').screenshot({path:`${directory}/${zone}-no-${kind}.png`});
              await page.evaluate(()=>{for(const o of window.__hrHidden)o.visible=true;});
            }
            await page.evaluate(() => { window.__hrFar.children[0].children.forEach(m => { m.visible = !m.name.includes('bamboo'); }); });
            await page.waitForTimeout(500);
            await world.locator('canvas').screenshot({ path: `${directory}/${zone}-no-bamboo.png` });
            await page.evaluate(() => { window.__hrFar.children[0].children.forEach(m => { m.visible = false; }); });
            await page.waitForTimeout(500);
            await world.locator('canvas').screenshot({ path: `${directory}/${zone}-no-cards.png` });
          }
          sample.farPose = farPose;
          if (process.env.HR_FAR_TELE_ALL === '1') {
            await page.evaluate(() => { window.__hrSetTele(true); });
            await page.waitForTimeout(1800);
            await world.locator('canvas').screenshot({ path: `${directory}/${size.join('x')}-high-${zone}-tele20.png` });
            sample.farTele = { ...farPose, fov: 20 };
            await page.evaluate(() => { window.__hrSetTele(false); });
          }
          if(process.env.HR_FAR_MEASURE_FAR==='1'){
            await page.evaluate(()=>{window.__hrProfile.frames=[];});
            await page.waitForTimeout(3000);
            const observed=await page.evaluate(()=>window.__hrProfile.frames);
            sample.farObserved={calls:observed.reduce((n,f)=>n+f.calls,0)/observed.length,
              triangles:observed.reduce((n,f)=>n+f.triangles,0)/observed.length};
            await page.evaluate(()=>{window.__hrSetObserver(false);window.__hrProfile.frames=[];});
            const session=await page.context().newCDPSession(page); await session.send('Performance.enable');
            const metrics=async()=>Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
            const state=()=>page.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus(),
              paused:document.querySelector('[data-world-build]')?.getAttribute('data-world-paused'),contextLost:window.__hrContextLost}));
            const startState=await state(),a=await metrics(),start=Date.now(); await page.waitForTimeout(10000);
            const seconds=(Date.now()-start)/1000,b=await metrics(),endState=await state();
            const frames=await page.evaluate(()=>window.__hrProfile.frames.length);
            for(const s of [startState,endState]) if(s.visibility!=='visible'||!s.focused||s.paused!=='false'||s.contextLost)throw new Error('Invalid far FPS state');
            sample.farNative={seconds,frames,fps:frames/seconds,cpuScriptMs:(b.ScriptDuration-a.ScriptDuration)*1000/seconds,
              cpuTaskMs:(b.TaskDuration-a.TaskDuration)*1000/seconds,startState,endState};
            await session.detach();await page.evaluate(()=>{window.__hrSetObserver(true);});
            console.log('FAR NATIVE FPS',JSON.stringify({zone,...sample.farNative}));
          }
          if (process.env.HR_FAR_TELE === '1' && zone === 'horizon') {
            const telePose={position:[40,100,-400],target:[-680,170,-620]};
            await world.evaluate((el,detail)=>el.dispatchEvent(new CustomEvent('tqa:postcard',{detail})),telePose);
            await page.evaluate(()=>{window.__hrSetTele(true);});
            await page.waitForTimeout(2000);
            await world.locator('canvas').screenshot({path:`${directory}/1600x900-high-farthest-tele20.png`});
            sample.tele={...telePose,fov:20,method:'Review WebGL perspective + matching AO/aerial inverse projection; no runtime edits'};
            await page.evaluate(()=>{window.__hrSetTele(false);});
          }
        }
        sample.glError = await world.locator('canvas').evaluate(canvas => canvas.getContext('webgl2').getError());
        if (sample.glError !== 0) throw new Error(`WebGL error after ${zone}/${quality}: ${sample.glError}`);
        report.samples.push(sample); console.log(JSON.stringify({ ...sample, owners: Object.entries(sample.owners).slice(0, 8) }));
        delete report.partialSample;
        await writeFile(`${directory}/metrics.json`, JSON.stringify(report, null, 2));
      }
    }
  }
  report.farCrownRequests = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /hr-tree-(spreading-crown|umbrella-crown|bamboo-clump)-lod1/.test(r.name)).map(r => ({url:r.name,transferSize:r.transferSize,duration:r.duration})));
} catch(error) { report.failure = { message:error.message, stack:error.stack }; throw error;
} finally { report.finishedAt = new Date().toISOString(); await browser.close(); await server?.close(); await writeFile(`${directory}/metrics.json`, JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ label, samples: report.samples.length, errors: report.errors.length }));
if (report.errors.length) { console.error(report.errors); process.exitCode = 1; }
