// Fixed-camera Edge hardware-GPU review of the actual deferred character + HR bike.
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { baselinePlugin } from './hr-char-b-baseline.mjs';

const directory = 'tmp/hr-char-b-studio';
const output = process.env.HR_REVIEW_OUTPUT ?? 'test-results/hr-char-b/studio';
const port = Number(process.env.HR_REVIEW_PORT ?? 4203);
await mkdir(directory, { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(`${directory}/index.html`, '<html><head><link rel="icon" href="data:,"></head><body style="margin:0"><script type="module" src="/tmp/hr-char-b-studio/viewer.js"></script></body></html>');
await writeFile(`${directory}/viewer.js`, `
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadCharacter } from '/src/features/world/character/loader.ts';
import { setBakedAppearanceQuality } from '/src/features/world/character/baked-appearance.ts';
import { createRiderPose } from '/src/features/world/character/ride.ts';
import { createGd110 } from '/src/features/world/vehicle/mesh.ts';
import { installHrVehicle } from '/src/features/world/vehicle/hr-runtime.ts';
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(1000,1250); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;
const container=document.createElement('div'); container.dataset.worldQuality='high'; container.dataset.worldBuild='done';
document.body.appendChild(container); container.appendChild(renderer.domElement);
const scene=new THREE.Scene(); scene.background=new THREE.Color('#9aa39d');
scene.environment=new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),.04).texture;
scene.environmentIntensity=.55; scene.add(new THREE.HemisphereLight('#f5f0e5','#596b58',.8));
const sun=new THREE.DirectionalLight('#fff0d6',2.6); sun.position.set(-2.5,5,4); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=sun.shadow.camera.bottom=-2;
sun.shadow.camera.right=sun.shadow.camera.top=2; sun.shadow.bias=-.0004; sun.shadow.normalBias=.02; scene.add(sun);
const rim=new THREE.DirectionalLight('#d6e4ff',1.2); rim.position.set(3,3,-4); scene.add(rim);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:'#8b8f7a',roughness:1}));
floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
const camera=new THREE.PerspectiveCamera(30,.8,.01,100);
const character=await loadCharacter('/world/start/character-duy.glb'); character.root.position.y=.9; scene.add(character.root);
character.mixer.update(0);
const skins=[]; character.root.traverse(n=>{if(n.isSkinnedMesh)skins.push(n)});
const original=skins[0].geometry, rider=createRiderPose(character), bike=createGd110(); scene.add(bike);
const vehicle=installHrVehicle(bike,()=>false); bike.visible=false;
let riding=false, previousHairPixels;
window.review={
 sampleHair(){renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(800*600*4);
  gl.readPixels(100,650,800,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let changed=0,maxDelta=0;
  if(previousHairPixels)for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-previousHairPixels[i]);
   if(d>2)changed++;maxDelta=Math.max(maxDelta,d);}previousHairPixels=pixels;return {changed,maxDelta};},
 set(view,quality='High',steering=0){
  riding=['riding','grip','grip-side','steering'].includes(view); bike.visible=riding;
  container.dataset.worldQuality=quality.toLowerCase(); vehicle.setQuality(quality.toLowerCase());
  for(const mesh of skins)setBakedAppearanceQuality(mesh,quality);
  rider.update({mode:'walk',speed:0},bike);
  character.root.position.set(0,.9,0); character.root.quaternion.identity();
  character.actions.idle.setEffectiveWeight(view==='walking'?0:1);
  character.actions.walk.setEffectiveWeight(view==='walking'?1:0); character.actions.run.setEffectiveWeight(0);
  character.mixer.setTime(view==='walking'?.24:0);
  bike.getObjectByName('steering').rotation.y=steering;
  if(riding)rider.update({mode:'ride',speed:2},bike);
  const views={front:[0,1,4.6,0,.9,0],face:[.185,1.6,.727,0,1.58,0],
   'hair-front':[0,1.79,.56,0,1.7,0], 'hair-side':[.57,1.73,.12,0,1.68,0],
   'hair-back':[.10,1.75,-.60,0,1.69,0],
   walking:[-2.8,1.2,3.6,0,.9,0],riding:[-2.9,1.6,3.2,0,.85,0],
   grip:[-.58,1.27,.76,-.32,1.02,.35], 'grip-side':[-.70,1.14,.32,-.32,1.02,.35],
   steering:[-.58,1.27,.76,-.32,1.02,.35]};
  camera.position.fromArray(views[view].slice(0,3)); camera.lookAt(new THREE.Vector3().fromArray(views[view].slice(3)));
 },
 status(){const m=skins[0];return {swapped:m.geometry!==original,materials:Array.isArray(m.material)?m.material.length:1,
  triangles:(m.geometry.index?.count??m.geometry.attributes.position.count)/3,bones:m.skeleton.bones.length,
  morphs:m.geometry.morphAttributes.position?.length??0,grip:m.morphTargetInfluences,
  calls:renderer.info.render.calls,tris:renderer.info.render.triangles,bike:bike.userData.hrVehicle}},
 contacts(){const m=skins[0]; m.updateWorldMatrix(true,false); m.skeleton.update();
  const p=new THREE.Vector3(), a=new THREE.Vector3(), b=new THREE.Vector3(), axis=new THREE.Vector3(); const result={};
  for(const sign of [-1,1]){a.set(sign*.34,1.25,.459).multiplyScalar(.81); b.set(sign*.45,1.25,.42).multiplyScalar(.81);
   bike.getObjectByName('steering').localToWorld(a.sub(new THREE.Vector3(0,.91,.43).multiplyScalar(.81)));
   bike.getObjectByName('steering').localToWorld(b.sub(new THREE.Vector3(0,.91,.43).multiplyScalar(.81)));
   axis.copy(b).sub(a); const length=axis.length(); axis.normalize(); let inside=0,nearest=Infinity;const points=[];
   for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,p);m.localToWorld(p);
    const q=p.clone().sub(a),t=q.dot(axis);if(t<0||t>length)continue;
    const radial=q.addScaledVector(axis,-t).length(); if(radial<.01944){inside++;if(points.length<5)points.push({p:p.toArray(),joints:[0,1,2,3].map(c=>[m.skeleton.bones[m.geometry.attributes.skinIndex.getComponent(i,c)].name,m.geometry.attributes.skinWeight.getComponent(i,c)])});}nearest=Math.min(nearest,radial);}
   result[sign]={verticesInsideGrip:inside,nearestRadius:nearest,points};
  }return result;
 }
};
window.review.set('front'); renderer.setAnimationLoop(()=>{vehicle.update();renderer.render(scene,camera)});
`);
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const report = {};
try {
  for (const variant of (process.env.HR_REVIEW_VARIANT ? [process.env.HR_REVIEW_VARIANT] : ['before', 'after'])) {
    const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: `tmp/hr-char-b-cache/node_modules/${variant}`,
      plugins: variant === 'before' ? [baselinePlugin()] : [], server: { host: '127.0.0.1', port, strictPort: true } });
    await server.listen();
    const page = await browser.newPage({ viewport: { width: 1000, height: 1250 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      await page.goto(`http://127.0.0.1:${port}/${directory}/index.html`);
      await page.waitForFunction(() => window.review?.status().swapped, null, { timeout: 120000 });
      const gpu = await page.evaluate(() => { const gl = document.querySelector('canvas').getContext('webgl2'); return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); });
      assert.ok(gpu && !/swiftshader|llvmpipe|software/i.test(gpu), gpu);
      const views = ['front', 'face', 'hair-front', 'hair-side', 'hair-back', 'walking', 'riding', 'grip', 'grip-side'];
      const statuses = {};
      for (const view of views) {
        await page.evaluate(view => window.review.set(view), view);
        if (view === 'riding') await page.waitForFunction(() => window.review.status().bike.state === 'ready', null, { timeout: 120000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${output}/${variant}-${view}.png` });
        statuses[view] = await page.evaluate(() => window.review.status());
      }
      statuses.contacts = await page.evaluate(() => window.review.contacts());
      if (variant === 'after') for (const data of Object.values(statuses.contacts)) assert.equal(data.verticesInsideGrip, 0);
      for (const angle of [-.32, .32]) {
        await page.evaluate(a => window.review.set('steering', 'High', a), angle); await page.waitForTimeout(300);
        await page.screenshot({ path: `${output}/${variant}-steering-${angle < 0 ? 'left' : 'right'}.png` });
        const contacts = await page.evaluate(() => window.review.contacts());
        statuses[`steering-${angle}`] = contacts;
        if (variant === 'after') for (const data of Object.values(contacts)) assert.equal(data.verticesInsideGrip, 0);
      }
      if (variant === 'after') {
        await page.evaluate(() => window.review.set('riding', 'Balanced'));
        await page.waitForFunction(() => window.review.status().triangles < 100000 && window.review.status().swapped, null, { timeout: 120000 });
        await page.evaluate(() => window.review.set('grip', 'Balanced')); await page.waitForTimeout(300);
        await page.screenshot({ path: `${output}/after-balanced-grip.png` });
        statuses.balanced = { ...await page.evaluate(() => window.review.status()), contacts: await page.evaluate(() => window.review.contacts()) };
        for (const data of Object.values(statuses.balanced.contacts)) assert.equal(data.verticesInsideGrip, 0);
        await page.evaluate(() => window.review.set('riding', 'Low')); await page.waitForTimeout(300);
        await page.screenshot({ path: `${output}/after-low.png` });
        statuses.low = await page.evaluate(() => window.review.status());
        assert.equal(statuses.low.swapped, false);
        assert.equal(statuses.grip.morphs, 1);
        assert.equal(statuses.grip.grip[0], 1);
      }
      await page.evaluate(()=>window.review.set('face','High'));
      await page.waitForFunction(expected => window.review.status().swapped && window.review.status().triangles === expected,
        statuses.face.triangles, {timeout:120000});
      await page.waitForTimeout(800);
      await page.evaluate(()=>window.review.sampleHair());await page.waitForTimeout(250);
      statuses.staticHairStability = await page.evaluate(()=>window.review.sampleHair());
      assert.equal(statuses.staticHairStability.changed, 0, 'static groom flickers');
      report[variant] = { gpu, statuses, errors };
      console.log(variant, JSON.stringify(report[variant]));
      assert.deepEqual(errors, []);
    } finally { await page.close(); await server.close(); }
  }
  await writeFile(`${output}/runtime.json`, JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
