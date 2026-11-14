// Isolated material/geometry review before the ticket's single production build.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
const before = process.argv.includes('--baseline');
const uncut = process.argv.includes('--uncut');
const output = before ? 'test-results/ms-c2/ms-c-before' : uncut ? 'test-results/ms-c2/uncut' : 'test-results/ms-c2/isolated';
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
${process.argv.includes('--no-normal') ? `const skin=statue.group.getObjectByName('milestones-static-walk-white');skin.material.normalMap=null;skin.material.needsUpdate=true;` : ''}
${uncut ? `const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const original = await new GLTFLoader().loadAsync('/world/milestones/character-milestones-walk.glb');
original.scene.traverse(node=>{if(node.isMesh){const body=statue.group.getObjectByName('milestones-static-walk-white');body.geometry.dispose();body.geometry=node.geometry;}});` : ''}
const clock=new THREE.Clock();
window.review={
 set(angle,quality){document.body.dataset.worldQuality=quality;camera.position.set(Math.sin(angle)*11,4.5,Math.cos(angle)*11);camera.lookAt(0,3,0);},
 status(){return {ready:statue.group.userData.ready,triangles:statue.group.userData.triangles,draws:renderer.info.render.calls,env:!!scene.environment,programs:renderer.info.programs.map(p=>p.name)};},
};window.review.set(.18,'high');
renderer.setAnimationLoop(()=>{environment.update();statue.update(clock.getDelta(),false);renderer.render(scene,camera);});
`);
const baselineFiles = ['milestones-statue.ts', 'milestones-statue-geometry.ts'];
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'node_modules/.cache/ms-c-vite',
  plugins: before ? [{ name: 'read-only-ms-c-statue', enforce: 'pre', load(id) {
    const file = baselineFiles.find(file => id.replaceAll('\\', '/').endsWith(`/zones/${file}`));
    if (file) return execFileSync('git', ['show', `00e1850:src/features/world/zones/${file}`], { encoding: 'utf8', windowsHide: true });
  }, configureServer(server) {
    const bytes = execFileSync('git', ['show', '00e1850:public/world/milestones/character-milestones-walk.glb'], { windowsHide: true });
    server.middlewares.use((req, res, next) => {
      if (req.url !== '/world/milestones/character-milestones-walk.glb') return next();
      res.setHeader('Content-Type', 'model/gltf-binary'); res.end(bytes);
    });
  } }] : [],
  server: { host: '127.0.0.1', port: 4527, strictPort: true } });
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
  await page.evaluate(() => window.review.set(.18, 'high'));
  await page.waitForTimeout(500);
  const status = await page.evaluate(() => window.review.status());
  await writeFile(`${output}/runtime.json`, JSON.stringify({ status, errors }, null, 2));
  console.log(JSON.stringify({ status, errors }));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
