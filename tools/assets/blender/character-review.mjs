// Isolated runtime turnarounds, using the same loader, mesh and appearance hook.
// No production entry/config changes. Run: node tools/assets/blender/character-review.mjs
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const directory = 'tmp/gfx-p5';
const software = process.env.CHARACTER_REVIEW_SOFTWARE === '1';
const shots = process.env.CHARACTER_REVIEW_OUTPUT ?? `test-results/gfx-p5/lead3-${software ? 'software' : 'closeups'}`;
await mkdir(shots, { recursive: true });
await mkdir(directory, { recursive: true });
await rm("tmp/gfx-p5/viewer.ts", { force: true });
await writeFile(`${directory}/viewer.html`, '<html><head><link rel="icon" href="data:,"></head><body style="margin:0"><script type="module" src="/tmp/gfx-p5/viewer.js"></script></body></html>');
await writeFile(`${directory}/viewer.js`, `
import * as THREE from 'three';
import { loadCharacter } from '/src/features/world/character/loader.ts';
import { createGd110, disposeGd110 } from '/src/features/world/vehicle/mesh.ts';
import { setBakedAppearanceQuality } from '/src/features/world/character/baked-appearance.ts';
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(1280,900); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#bfc9c1');
scene.add(new THREE.HemisphereLight('#f5f0e5','#596b58',2));
const sun = new THREE.DirectionalLight('#fff0d6',3); sun.position.set(-3,6,4); scene.add(sun);
const fill = new THREE.DirectionalLight('#cbd9dc',1); fill.position.set(3,3,-3); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#9b9f87',roughness:1}));
floor.rotation.x=-Math.PI/2; floor.position.y=-.005; scene.add(floor);
const camera = new THREE.PerspectiveCamera(32,1280/900,.01,100);
const character = await loadCharacter('/world/start/character-duy.glb');
character.root.position.y=.9; scene.add(character.root);
const bike = createGd110(); scene.add(bike);
const skins=[]; character.root.traverse(n=>{if(n.isSkinnedMesh) skins.push(n)});
const chassis=bike.getObjectByName('chassis');
const originalMaterials = new Map([...skins,chassis].map(mesh=>[mesh,mesh.material]));
const target = new THREE.Vector3();
window.review = {
 set(kind, angle, quality) {
   character.root.visible = kind !== 'vehicle'; bike.visible = kind === 'vehicle';
   const y = kind === 'face' ? 1.57 : kind === 'vehicle' ? .61 : .88;
   const radius = kind === 'face' ? .95 : kind === 'vehicle' ? 3.45 : 3.8;
   camera.position.set(Math.sin(angle)*radius,y+.10,Math.cos(angle)*radius);
   target.set(0,y,0);camera.lookAt(target);
   for(const mesh of [...skins,chassis]) setBakedAppearanceQuality(mesh,quality);
 },
 status() { return [...skins,chassis].map(mesh=>({name:mesh.name, pbr:mesh.material.isMeshStandardMaterial===true,
  original:mesh.material===originalMaterials.get(mesh),
  normal:!!mesh.material.normalMap, uv:!!mesh.geometry.attributes.uv,
  normalSize:mesh.material.normalMap?.image.width, atlas:mesh.material.normalMap?.uuid,
  triangles:(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3,
  bones:mesh.skeleton.bones.length})); },
 dispose() { character.dispose();disposeGd110(bike);renderer.dispose(); }
};
window.review.set('character',0,'Low');
renderer.setAnimationLoop(()=>{ renderer.render(scene,camera); });
`);

const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: "node_modules/.cache/gfx-p5-vite", server: { host: '127.0.0.1', port: 4516, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: software,
  ...(software ? { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
const requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/world/character/')) requests.push(request.url()); });
try {
  await page.goto('http://127.0.0.1:4516/tmp/gfx-p5/viewer.html');
  await page.waitForFunction(() => !!window.review);
  for (const kind of ['character', 'vehicle']) {
    for (const quality of ['Low', 'High']) {
      const requestCount = requests.length;
      for (const [name, angle] of [['front', .18], ['side', Math.PI / 2], ['rear', Math.PI * .85]]) {
        await page.evaluate(([kind, angle, quality]) => window.review.set(kind, angle, quality), [kind, angle, quality]);
        if (quality === 'High') await page.waitForFunction(([kind, software]) => window.review.status()[kind === 'vehicle' ? 1 : 0][software ? 'original' : 'pbr'], [kind, software], { timeout: 60000 });
        await page.waitForTimeout(800);
        if (quality === 'Low') assert.equal((await page.evaluate(() => window.review.status()))[kind === 'vehicle' ? 1 : 0].original, true);
        await page.screenshot({ path: `${shots}/${kind}-${quality.toLowerCase()}-${name}.png` });
      }
      if (quality === 'Low' || software) assert.equal(requests.length, requestCount, 'Low/software must not load bake assets');
    }
  }
  for (const [name, angle] of [['front', 0], ['three-quarter', .65], ['side', Math.PI / 2]]) {
    await page.evaluate(angle => window.review.set('face', angle, 'High'), angle);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}/face-high-${name}.png` });
  }
  const status = await page.evaluate(() => window.review.status());
  assert.equal(status[0].bones, 19);
  assert.equal(status[0].triangles, software ? 7784 : 10544);
  assert(status.every(mesh => software ? mesh.original && !mesh.normal : mesh.normal && mesh.uv));
  if (!software) {
    assert(status.every(mesh => mesh.normalSize === 1024));
    assert.equal(status[0].atlas, status[1].atlas, 'character and bike share one GPU atlas');
    for (const kind of ['normal', 'orm']) {
      assert.equal(requests.filter(url => url.endsWith('/' + kind + '-1024.ktx2')).length, 1);
    }
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(`${shots}/runtime.json`, JSON.stringify({ status, requests, errors }, null, 2));
  console.log(JSON.stringify({ status, requests, errors }));
  await page.evaluate(() => window.review.dispose());
} finally {
  await browser.close();
  await server.close();
}
