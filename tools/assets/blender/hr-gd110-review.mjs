// Hardware Edge studio turnarounds, using the production factory + controller.
// No Next builds or downloads. node tools/assets/blender/hr-gd110-review.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const directory = 'tmp/hr-gd110', output = 'test-results/hr-gd110/studio';
await mkdir(output, { recursive: true });
await writeFile(`${directory}/viewer.html`, '<html><head><link rel="icon" href="data:,"></head><body style="margin:0"><div data-world-quality="high" data-world-build="done" data-world-intro="done"><script type="module" src="/tmp/hr-gd110/viewer.js"></script></div></body></html>');
await writeFile(`${directory}/viewer.js`, `
import * as T from 'three';
import { createEnvironment } from '/src/features/world/sky/environment.ts';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createGd110, disposeGd110 } from '/src/features/world/vehicle/mesh.ts';
import { createVehicleView } from '/src/features/world/vehicle/view.ts';
const renderer = new T.WebGLRenderer({antialias:true}); renderer.setSize(1440,1000);renderer.setPixelRatio(1);
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
document.querySelector('div').append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#b2b6b0');
const environment=createEnvironment(renderer,scene);environment.setQuality('High');environment.setTimeOfDay(0);
scene.add(new T.HemisphereLight('#fff4df','#596257',.75));
const sun=new T.DirectionalLight('#fff2de',1.6);sun.position.set(-3,5,4);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.1,far:15});sun.shadow.bias=-.0001;sun.shadow.normalBias=.012;scene.add(sun);
RectAreaLightUniformsLib.init();
for(const x of [-1.4,1.4]){const strip=new T.RectAreaLight('#fff8ee',5,1.8,.18);strip.position.set(x,1.8,.05);strip.lookAt(0,.8,.05);scene.add(strip);}
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#787b70',roughness:.94}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;floor.receiveShadow=true;scene.add(floor);
const camera=new T.PerspectiveCamera(32,1440/1000,.01,100);
const before=createGd110();scene.add(before);
const after=createVehicleView({surfaceHeight:()=>0});scene.add(after.group);
const corridor={length:100,halfWidthAt:()=>3,pointAt:s=>({x:0,z:s}),tangentAt:()=>({x:0,z:1})};
after.update({mode:'walk',s:0,lateral:0,speed:0,heading:0},corridor,0);
const bike=after.riderFrame;
window.review={
 set(label,angle,quality='high',distance=3.5){
  before.visible=label==='before';after.group.visible=label!=='before';
  document.querySelector('div').setAttribute('data-world-quality',quality);
  camera.fov=32;camera.updateProjectionMatrix();
  camera.position.set(Math.sin(angle)*distance,.76,Math.cos(angle)*distance);camera.lookAt(0,.62,0);
 },
 closeup(kind){camera.position.set(-1.35,kind==='fender'?.29:.75,kind==='fender'?.52:.05);camera.lookAt(kind==='fender'?-.05:0,kind==='fender'?.32:.72,kind==='fender'?.52:-.04);camera.fov=kind==='fender'?25:32;camera.updateProjectionMatrix();},
 ride(){after.update({mode:'ride',s:0,lateral:0,speed:0,heading:0},corridor,0);after.update({mode:'ride',s:0,lateral:0,speed:0,heading:0},corridor,2);},
 steer(yaw,roll){bike.getObjectByName('steering').rotation.y=yaw;for(const name of ['front_wheel','rear_wheel'])bike.getObjectByName(name).rotation.x=roll;},
 status(){const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');const bounds=new T.Box3();const p=new T.Vector3();bike.updateMatrixWorld(true);bike.traverse(n=>{if(!n.isMesh||!n.visible)return;for(let i=0;i<n.geometry.attributes.position.count;i++){n.getVertexPosition(i,p);bounds.expandByPoint(p.applyMatrix4(n.matrixWorld));}});return {hr:bike.userData.hrVehicle,pmrem:!!scene.environment?.isPMREMTexture,environmentIntensity:scene.environmentIntensity,lean:bike.rotation.z,standFold:bike.getObjectByName('kickstand').rotation.x,gpu:gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
 bounds:bounds.getSize(new T.Vector3()).toArray(),
 visible:bike.children.filter(n=>n.visible).map(n=>n.name)};},
 dispose(){after.dispose();disposeGd110(before);environment.dispose();renderer.dispose();}
};
window.review.set('before',.65);renderer.setAnimationLoop(()=>{environment.update();renderer.render(scene,camera);});
`);
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'node_modules/.cache/hr-gd110-vite', server: { host: '127.0.0.1', port: 4518, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], requests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/world/vehicle/')) requests.push(r.url()); });
try {
  await page.goto('http://127.0.0.1:4518/tmp/hr-gd110/viewer.html');
  await page.waitForFunction(() => !!window.review);
  await page.waitForFunction(() => window.review.status().pmrem, null, { timeout: 90000 });
  const report = { errors, requests, captures: [] };
  for (const label of ['before', 'after']) {
    for (const [angle, radians] of [['front', 0], ['rear', Math.PI], ['side', Math.PI / 2], ['three-quarter', .65]]) {
      await page.evaluate(([label, radians]) => window.review.set(label, radians), [label, radians]);
      if (label === 'after') await page.waitForFunction(() => window.review.status().hr.state === 'ready', null, { timeout: 90000 });
      await page.waitForTimeout(2000);
      const file = `${label}-high-${angle}.png`;
      await page.screenshot({ path: `${output}/${file}` });
      report.captures.push({ file, ...await page.evaluate(() => window.review.status()) });
      console.log(file);
    }
  }
  for (const kind of ['fender','materials']) {
    await page.evaluate(kind => window.review.closeup(kind), kind);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${output}/after-high-close-${kind}.png` });
  }
  await page.evaluate(() => { window.review.set('after', -.9); window.review.ride(); });
  await page.waitForTimeout(500);
  report.riding = await page.evaluate(() => window.review.status());
  await page.screenshot({ path: `${output}/after-high-stand-folded.png` });
  await page.evaluate(() => window.review.steer(.30, 1.2));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${output}/after-high-steering.png` });
  await page.evaluate(() => window.review.set('after', .65, 'high', 24));
  await page.waitForFunction(() => window.review.status().hr.lod === 1);
  await page.waitForTimeout(500);
  report.far = await page.evaluate(() => window.review.status());
  await page.evaluate(() => { window.review.steer(0,0);window.review.set('after', .65, 'low'); });
  await page.waitForFunction(() => window.review.status().hr.state === 'fallback');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${output}/after-low-three-quarter.png` });
  report.low = await page.evaluate(() => window.review.status());
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(requests.length, 1);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors, requests, high: report.captures.at(-1), low: report.low, far: report.far }));
  await page.evaluate(() => window.review.dispose());
} finally { await browser.close(); await server.close(); }
