// HR-CHAR studio review: same loader + appearance hook as the world, before/after, Edge with GPU.
// before = HEAD's appearance code (GFX-P5 close-up skin), extracted with `git show` into tmp/.
// Run: node tools/assets/blender/hr-char-review.mjs   (port HR_REVIEW_PORT, default 4205)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.HR_REVIEW_PORT ?? 4205);
const directory = 'tmp/hr-char-review';
const shots = process.env.HR_REVIEW_OUTPUT ?? 'test-results/hr-char/studio';
await mkdir(`${directory}/old`, { recursive: true });
await mkdir(shots, { recursive: true });
const base = process.env.HR_REVIEW_BASE ?? 'HEAD';
for (const file of ['loader.ts', 'baked-appearance.ts']) {
  let source = execFileSync('git', ['show', `${base}:src/features/world/character/${file}`], { encoding: 'utf8' });
  source = source.replace(/from "\.\.\/([^"]+)"/g, 'from "/src/features/world/$1"')
    .replace(/from "\.\/(fallback|runtime)"/g, 'from "/src/features/world/character/$1"')
    .replace(/import\("\.\/runtime"\)/g, 'import("/src/features/world/character/runtime")');
  await writeFile(`${directory}/old/${file}`, '// @ts-nocheck\n/* eslint-disable */\n' + source);
}
const viewer = variant => `
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadCharacter } from '${variant === 'before' ? `/${directory}/old/loader.ts` : '/src/features/world/character/loader.ts'}';
import { setBakedAppearanceQuality } from '${variant === 'before' ? `/${directory}/old/baked-appearance.ts` : '/src/features/world/character/baked-appearance.ts'}';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1000, 1250); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#9aa39d');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .55;
scene.add(new THREE.HemisphereLight('#f5f0e5', '#596b58', .8));
const sun = new THREE.DirectionalLight('#fff0d6', 2.6); sun.position.set(-2.5, 5, 4); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -2; sun.shadow.camera.right = sun.shadow.camera.top = 2;
sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; scene.add(sun);
const rim = new THREE.DirectionalLight('#d6e4ff', 1.2); rim.position.set(3, 3, -4); scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#8b8f7a', roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const camera = new THREE.PerspectiveCamera(30, 1000 / 1250, .01, 100);
const container = document.createElement('div'); container.setAttribute('data-world-quality', 'high'); container.setAttribute('data-world-build', 'done');
document.body.appendChild(container); container.appendChild(renderer.domElement);
const character = await loadCharacter('/world/start/character-duy.glb');
character.root.position.y = .9; scene.add(character.root);
character.mixer.update(0);
const skins = []; character.root.traverse(n => { if (n.isSkinnedMesh) skins.push(n); });
const original = skins[0].material;
const target = new THREE.Vector3();
window.review = {
  set(view) {
    const views = {
      front: [0, 1.0, 4.6, .9], back: [Math.PI, 1.0, 4.6, .9], left: [Math.PI / 2, 1.0, 4.6, .9],
      'three-quarter': [-.75, 1.15, 4.6, .9], face: [.25, 1.6, .75, 1.58], hands: [.9, .95, 1.25, .88], shoes: [.55, .35, 1.1, .12],
    };
    const [angle, y, radius, ty] = views[view];
    camera.position.set(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
    target.set(view === 'hands' ? .35 : 0, ty, 0); camera.lookAt(target);
    for (const mesh of skins) setBakedAppearanceQuality(mesh, 'High');
  },
  status() { const m = skins[0]; return { swapped: m.material !== original, materials: Array.isArray(m.material) ? m.material.length : 1,
    triangles: (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, bones: m.skeleton.bones.length,
    calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
};
window.review.set('front');
renderer.setAnimationLoop(() => renderer.render(scene, camera));
`;
for (const variant of ['before', 'after']) {
  await writeFile(`${directory}/${variant}.js`, viewer(variant));
  await writeFile(`${directory}/${variant}.html`, `<html><head><link rel="icon" href="data:,"></head><body style="margin:0"><script type="module" src="/${directory}/${variant}.js"></script></body></html>`);
}
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'tmp/hr-char-cache/node_modules/studio',
  server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const result = {};
try {
  for (const variant of ['before', 'after']) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1250 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_debug_renderer_info');
      return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null;
    });
    assert.ok(gpu && !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu), `Hardware GPU required: ${gpu}`);
    await page.goto(`http://127.0.0.1:${port}/${directory}/${variant}.html`);
    await page.waitForFunction(() => !!window.review, null, { timeout: 120000 });
    console.log('waiting', variant);
    page.on('console', message => console.log('[page]', message.type(), message.text().slice(0, 300)));
    await page.waitForFunction(() => window.review.status().swapped, null, { timeout: 120000 }).catch(error => { console.log('ERRORS', errors); throw error; });
    for (const view of ['front', 'left', 'back', 'three-quarter', 'face', 'hands', 'shoes']) {
      await page.evaluate(view => window.review.set(view), view);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${shots}/${variant}-${view}.png` });
    }
    await page.evaluate(() => window.review.set('front'));
    await page.waitForTimeout(300);
    result[variant] = { gpu, status: await page.evaluate(() => window.review.status()), errors };
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.close();
  }
  assert.equal(result.after.status.bones, 19);
  await writeFile(`${shots}/runtime.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await server.close();
  // Generated viewers live only for the run (keeps typecheck/lint of the tree clean).
  await rm(directory, { recursive: true, force: true });
}
