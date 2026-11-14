// Controlled ABBA: exact pre-MS-C factory vs current, same real-terrain context,
// camera, High environment, renderer and deferred dressing. No other zone delta.
// Measures renderer/scene JS CPU with CDP, not GPU time or whole-world FPS.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const directory = 'tmp/ms-c2/cpu', output = 'test-results/ms-c2/cpu';
await mkdir(directory, { recursive: true }); await mkdir(output, { recursive: true });
const baselineRevision = '00e1850^';
const source = execFileSync('git', ['show', `${baselineRevision}:src/features/world/zones/milestones.ts`], { encoding: 'utf8', windowsHide: true });
const rewritten = source.replaceAll('"../../../content/', '"/src/content/').replaceAll('"../', '"/src/features/world/').replaceAll('"./', '"/src/features/world/zones/');
await writeFile(`${directory}/baseline.ts`, rewritten);
await writeFile(`${directory}/viewer.html`, '<html><head><link rel="icon" href="data:,"></head><body data-world-quality="high" style="margin:0"><script type="module" src="./viewer.js"></script></body></html>');
await writeFile(`${directory}/viewer.js`, `
import * as THREE from 'three';
import { createMilestonesScene as baseline } from './baseline.ts';
import { createMilestonesScene as current } from '/src/features/world/zones/milestones.ts';
import { surfaceHeight } from '/src/features/world/scene/compose.ts';
import { ZONES } from '/src/features/world/layout/zones.ts';
import { nearestPath } from '/src/features/world/terrain/samples.ts';
import { PATH_WIDTH,TERRAIN_SEED,waterLevelAt } from '/src/features/world/terrain/height.ts';
import { ZONE_IDS } from '/src/features/interaction/targets.ts';
import { createEnvironment } from '/src/features/world/sky/environment.ts';
const layout=ZONES.find(z=>z.id==='milestones'), yaw=Math.atan2(layout.lookDirection.x,layout.lookDirection.z);
const anchorY=surfaceHeight(layout.position.x,layout.position.z);
const world=(x,z)=>({x:layout.position.x+x*Math.cos(yaw)+z*Math.sin(yaw),z:layout.position.z-x*Math.sin(yaw)+z*Math.cos(yaw)});
const ctx={seed:TERRAIN_SEED+ZONE_IDS.indexOf('milestones'),
 heightAt(x,z){const p=world(x,z);return surfaceHeight(p.x,p.z)-anchorY;},
 onPath(x,z){const p=world(x,z);return Math.abs(x)<=2.6||nearestPath(p.x,p.z).distance<=PATH_WIDTH/2;},
 underWater(x,z){const p=world(x,z);return surfaceHeight(p.x,p.z)<=waterLevelAt(p.z);}};
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1280,960);renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#9aafa0');
scene.add(new THREE.HemisphereLight('#fff2de','#53665c',2));
const sun=new THREE.DirectionalLight('#ffe7c0',2.8);sun.position.set(-3,7,5);scene.add(sun);
const floorGeo=new THREE.PlaneGeometry(100,100,80,80);floorGeo.rotateX(-Math.PI/2);
const p=floorGeo.getAttribute('position');for(let i=0;i<p.count;i++)p.setY(i,ctx.heightAt(p.getX(i),p.getZ(i))-.01);floorGeo.computeVertexNormals();
scene.add(new THREE.Mesh(floorGeo,new THREE.MeshStandardMaterial({color:'#657762',roughness:1})));
const environment=createEnvironment(renderer,scene);environment.setQuality('High');
const camera=new THREE.PerspectiveCamera(36,1280/960,.05,200);
const target=new THREE.Vector3(-4.7,ctx.heightAt(-4.7,4)+4,4), angle=Math.PI/2+25*Math.PI/180+.12;
camera.position.copy(target).add(new THREE.Vector3(Math.sin(angle)*10,1,Math.cos(angle)*10));camera.lookAt(target);
const zone=(window.msCpuVersion==='A'?baseline:current)(ctx);scene.add(zone.group);
let previous=performance.now();
renderer.setAnimationLoop(()=>{const now=performance.now(),dt=(now-previous)/1000;previous=now;environment.update();zone.update?.(dt,false);renderer.render(scene,camera);});
window.review={ready(){return !zone.group.getObjectByName('milestones-walking-statue')||zone.group.userData.statue.ready;},
 status(){return {draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,quality:document.body.dataset.worldQuality};}};
`);
const vite = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'node_modules/.cache/ms-c-vite', server: { host: '127.0.0.1', port: 4528, strictPort: true } });
await vite.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const samples = [], errors = [];
try {
  for (const label of ['A1', 'B1', 'B2', 'A2']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    try {
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(version => { window.msCpuVersion = version; }, label[0]);
      await page.goto(`http://127.0.0.1:4528/${directory}/viewer.html`);
      await page.waitForFunction(() => window.review?.ready()); await page.waitForTimeout(6000);
      await page.screenshot({ path: `${output}/${label}.png` });
      const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
      const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
      const start = await metrics(); await page.waitForTimeout(10000); const end = await metrics(), seconds = end.Timestamp - start.Timestamp;
      const sample = { label, seconds, scriptMsPerSecond: (end.ScriptDuration - start.ScriptDuration) * 1000 / seconds,
        taskMsPerSecond: (end.TaskDuration - start.TaskDuration) * 1000 / seconds, status: await page.evaluate(() => window.review.status()) };
      samples.push(sample); console.log(JSON.stringify(sample));
    } finally { await context.close(); }
  }
  const mean = prefix => samples.filter(s => s.label[0] === prefix).reduce((sum, s) => sum + s.scriptMsPerSecond, 0) / 2;
  const delta = mean('B') - mean('A'), report = { baselineRevision, samples, delta, errors, pass: errors.length === 0 && delta <= 10,
    scope: 'Isolated complete Milestones zone, composed real terrain context, identical High IBL/lighting/camera/dressing. CDP JS CPU; no other zones or post passes.' };
  await writeFile(`${output}/abba.json`, JSON.stringify(report, null, 2));
  assert(report.pass, `ABBA CPU delta ${delta.toFixed(2)} ms/s; errors ${errors.join(', ')}`);
  console.log(`PASS: isolated Milestones ABBA +${delta.toFixed(2)} ms/s <= +10 ms/s`);
} finally {
  await browser.close(); await vite.close(); await rm(`${directory}/baseline.ts`, { force: true });
}
