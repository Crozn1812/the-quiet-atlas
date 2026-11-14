// Isolated material/geometry review before the ticket's single production build.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const output = 'test-results/ms-c/isolated';
await mkdir(output, { recursive: true });
await mkdir('tmp/ms-c', { recursive: true });
await writeFile('tmp/ms-c/viewer.html', '<html><head><link rel="icon" href="data:,"></head><body data-world-quality="high" style="margin:0"><script type="module" src="/tmp/ms-c/viewer.js"></script></body></html>');
await writeFile('tmp/ms-c/viewer.js', `
import * as THREE from 'three';
import { createMilestonesStatue } from '/src/features/world/zones/milestones-statue.ts';
import { milestoneCertificates } from '/src/features/world/zones/milestones.ts';
import { createEnvironment } from '/src/features/world/sky/environment.ts';
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(1280,960); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#9aafa0');
scene.add(new THREE.HemisphereLight('#fff2de','#53665c',2));
const sun=new THREE.DirectionalLight('#ffe7c0',2.8); sun.position.set(-3,7,5);scene.add(sun);
const camera=new THREE.PerspectiveCamera(36,1280/960,.05,100);
const statue=createMilestonesStatue(milestoneCertificates()); scene.add(statue.group);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#657762',roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);
const environment=createEnvironment(renderer,scene); environment.setQuality('High');
await statue.loadDetail();
const clock=new THREE.Clock();
window.review={
 set(angle,quality){document.body.dataset.worldQuality=quality;camera.position.set(Math.sin(angle)*11,4.5,Math.cos(angle)*11);camera.lookAt(0,3,0);},
 status(){return {ready:statue.group.userData.ready,triangles:statue.group.userData.triangles,draws:renderer.info.render.calls,env:!!scene.environment};},
};window.review.set(.18,'high');
renderer.setAnimationLoop(()=>{environment.update();statue.update(clock.getDelta(),false);renderer.render(scene,camera);});
`);
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'node_modules/.cache/ms-c-vite', server: { host: '127.0.0.1', port: 4527, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto('http://127.0.0.1:4527/tmp/ms-c/viewer.html');
  await page.waitForFunction(() => !!window.review);
  await page.waitForTimeout(3500);
  for (const [name, angle, quality] of [['front', .18, 'high'], ['back', Math.PI+.25, 'high'], ['sockets', -.65, 'high'], ['low', .18, 'low']]) {
    await page.evaluate(([angle,quality]) => window.review.set(angle,quality), [angle,quality]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${output}/${name}.png` });
  }
  const status = await page.evaluate(() => window.review.status());
  await writeFile(`${output}/runtime.json`, JSON.stringify({ status, errors }, null, 2));
  console.log(JSON.stringify({ status, errors }));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
