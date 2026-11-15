// Shader review before the single final Next build. No downloaded assets.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const dest = 'tmp/hr-sky/return1/preview';
await mkdir(dest, { recursive: true });
const html = `<!doctype html><html><head><link rel="icon" href="data:,"></head><body style="margin:0"><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import {createSkyDome} from '/src/features/world/sky/dome.ts';
import {lightingAt,applyCoastAtmosphere} from '/src/features/world/sky/grade.ts';
import {timeOfDayAt} from '/src/features/world/layout/lighting.ts';
window.THREE=THREE;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(1600,900); renderer.toneMapping=THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,1600/900,.1,100);
camera.lookAt(0,.66,-1);
let grade=applyCoastAtmosphere(lightingAt(1),.93);const sky=createSkyDome(grade);scene.add(sky.mesh);
window.sky=sky;window.renderer=renderer;
window.setGrade=p=>{grade=applyCoastAtmosphere(lightingAt(timeOfDayAt(p)),p);sky.update(grade);};
window.lookSun=()=>camera.lookAt(grade.sunDirection.x,Math.max(.20,grade.sunDirection.y),grade.sunDirection.z);
renderer.setAnimationLoop(()=>renderer.render(scene,camera));
window.ready=true;
</script></body></html>`;
const server = await createServer({ configFile:false, cacheDir:'tmp/hr-sky/vite', optimizeDeps:{noDiscovery:true,include:[]}, root:process.cwd(), server:{host:'127.0.0.1',port:0}, logLevel:'error',
  plugins:[{name:'sky-preview',configureServer(s){s.middlewares.use('/sky-preview', (_req,res)=>{res.setHeader('content-type','text/html');res.end(html);});}}],
});
await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:false});
const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/sky-preview`);
  await page.waitForFunction(()=>window.ready);
  await page.waitForTimeout(6000);
  for(const [label,t] of [['last-postcard',1],['quiet-shore',.89],['horizon',.76],['first-light',.15]]) {
    await page.evaluate(t=>window.setGrade(t),t);await page.waitForTimeout(2000);
    await page.screenshot({path:dest+'/'+label+'.png'});
  }
  await page.evaluate(()=>{window.setGrade(1);window.lookSun();});await page.waitForTimeout(2000);
  await page.screenshot({path:dest+'/silver-lining.png'});
  console.log(JSON.stringify({errors,info:await page.evaluate(()=>window.renderer.info.render)},null,2));
  await writeFile(dest+'/errors.json',JSON.stringify(errors,null,2));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();await server.close();}
