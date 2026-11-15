// Same-renderer sky-only ABBA; exact HEAD sky factory versus HR-SKY, no scene/asset differences.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import ts from 'typescript';
const dest = 'tmp/hr-sky/return1/cpu';
await mkdir(dest, { recursive: true });
const old = execFileSync('git', ['show', 'HEAD:src/features/world/sky/dome.ts'], {encoding:'utf8'})
  .replaceAll('"../', '"/src/features/world/').replaceAll('"./', '"/src/features/world/sky/');
const baselineJs = ts.transpileModule(old, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const html = `<!doctype html><html><head><link rel="icon" href="data:,"></head><body data-world-quality="high" style="margin:0"><script type="module">
import * as T from '/node_modules/three/build/three.module.js';
import {createSkyDome as A} from 'virtual:sky-main';
import {createSkyDome as B} from '/src/features/world/sky/dome.ts';
import {lightingAt,applyCoastAtmosphere} from '/src/features/world/sky/grade.ts';
const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1600,900);renderer.toneMapping=T.ACESFilmicToneMapping;document.body.appendChild(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(55,1600/900,.1,100);camera.lookAt(0,.66,-1);
const grade=applyCoastAtmosphere(lightingAt(.5),.76);let sky,previous=performance.now(),frames=[];
window.version=label=>{sky?.dispose();sky=(label==='A'?A:B)(grade);scene.add(sky.mesh);};
window.version('A');
renderer.setAnimationLoop(()=>{const now=performance.now(),dt=(now-previous)/1000;previous=now;sky.update(grade,dt,true);renderer.render(scene,camera);frames.push(now);});
window.sample=()=>{frames=[];};window.result=()=>({frames:frames.length,fps:(frames.length-1)*1000/(frames.at(-1)-frames[0]),triangles:renderer.info.render.triangles,calls:renderer.info.render.calls});
const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');window.gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);window.ready=true;
</script></body></html>`;
const vite=await createServer({configFile:false,cacheDir:'tmp/hr-sky/return1/cpu/vite',optimizeDeps:{noDiscovery:true,include:[]},root:process.cwd(),server:{host:'127.0.0.1',port:0},logLevel:'error',plugins:[{name:'sky-abba',resolveId(id){if(id==='virtual:sky-main')return '\0sky-main.js';},load(id){if(id==='\0sky-main.js')return baselineJs;},configureServer(s){s.middlewares.use('/sky-cpu',async(_req,res)=>{res.setHeader('content-type','text/html');res.end(await s.transformIndexHtml('/sky-cpu',html));});}}]});
await vite.listen();
const browser=await chromium.launch({channel:'msedge',headless:false});
const page=await browser.newPage({viewport:{width:1600,height:900}}),report={measurements:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
try {
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/sky-cpu`);await page.waitForFunction(()=>window.ready);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  report.gpu=await page.evaluate(()=>window.gpu);
  for(const label of ['A1','B1','B2','A2']) {
    await page.evaluate(v=>window.version(v),label[0]);await page.waitForTimeout(4000);
    const a=await cdp.send('Performance.getMetrics');await page.evaluate(()=>window.sample());await page.waitForTimeout(5000);
    const b=await cdp.send('Performance.getMetrics'),metric=(r,k)=>r.metrics.find(m=>m.name===k).value;
    report.measurements.push({label,...await page.evaluate(()=>window.result()),cpuTaskMsPerSecond:(metric(b,'TaskDuration')-metric(a,'TaskDuration'))*1000/(metric(b,'Timestamp')-metric(a,'Timestamp'))});
  }
  const avg=letter=>report.measurements.filter(m=>m.label[0]===letter).reduce((s,m)=>s+m.cpuTaskMsPerSecond,0)/2;
  report.cpuDeltaMsPerSecond=avg('B')-avg('A');report.status=report.errors.length?'FAIL':'PASS';
}finally{await browser.close();await vite.close();}
await writeFile(dest+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
