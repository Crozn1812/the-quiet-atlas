// Bake actual four-view photographs of the compressed tree, through Three/Edge.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { Document } from '@gltf-transform/core';
import { KHRTextureBasisu, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO } from '../shared.mjs';
import { evidence, temporary, output, encode, license, hash } from './hr-casuarina-package.mjs';

const manifest = JSON.parse(await readFile(`${output}/manifest.json`, 'utf8'));
const entries = manifest.assets.filter(e => e.architecture === 'casuarina');
const server = await createServer({ configFile: false, cacheDir: 'tools/styleframes/.vite/test-results/hr-casuarina/bake-cache', plugins: [{
  name: 'casuarina-bake', configureServer(s) {
    s.middlewares.use('/casuarina.html', (_req, res) => {
      res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="icon" href="data:,"><script type="module" src="/tools/assets/blender/hr-trees-viewer.mjs"></script>');
    });
  }, transform(source, id) {
    if (id.replaceAll('\\', '/').endsWith('/hr-trees-viewer.mjs')) return source
      .replace("a.id.startsWith('hr-tree-')", "a.id.startsWith('hr-tree-casuarina-')")
      .replace('let subject=null;', 'window.__casuarinaView={camera,scene,renderer}; let subject=null;');
  },
}], server: { host: '127.0.0.1', port: 4212, strictPort: true, watch: null } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:4212/casuarina.html'); await page.waitForFunction(() => window.__hr);
  const io = await createIO();
  for (const entry of entries) {
    await page.evaluate(id => window.__hr.single(id), entry.id);
    await page.screenshot({ path: `${evidence}/${entry.id}-high.png` });
    const baked = await page.evaluate(id => window.__hr.bake(id), entry.id);
    const input = `${temporary}/${entry.id}-impostor.png`, target = `${temporary}/${entry.id}-impostor.ktx2`;
    await writeFile(input, Buffer.from(baked.png, 'base64'));
    const doc = new Document(), buffer = doc.createBuffer(), [x, y, z] = baked.center, half = baked.frame / 2;
    const positions = doc.createAccessor().setType('VEC3').setArray(new Float32Array([x-half,y-half,z,x+half,y-half,z,x-half,y+half,z,x+half,y+half,z])).setBuffer(buffer);
    const uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array([0,1,.5,1,0,.5,.5,.5])).setBuffer(buffer);
    const indices = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0,1,2,2,1,3])).setBuffer(buffer);
    const texture = doc.createTexture().setImage(await encode(input, target)).setMimeType('image/ktx2');
    doc.createExtension(KHRTextureBasisu).setRequired(true);
    const unlit = doc.createExtension(KHRMaterialsUnlit);
    const material = doc.createMaterial('casuarina-four-view').setBaseColorTexture(texture).setAlphaMode('MASK').setAlphaCutoff(.30).setDoubleSided(true).setExtension('KHR_materials_unlit', unlit.createUnlit());
    const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', positions).setAttribute('TEXCOORD_0', uv).setIndices(indices).setMaterial(material));
    doc.createScene().addChild(doc.createNode(entry.id).setMesh(mesh));
    await doc.transform(meshopt({ encoder: MeshoptEncoder }));
    const file = `${entry.id}-impostor.glb`; await io.write(`${output}/${file}`, doc);
    const bytes = await readFile(`${output}/${file}`);
    entry.bounds = baked.bounds;
    entry.impostor = { file, path: `/world/lib/${file}`, bytes: bytes.length, sha256: hash(bytes), triangles: 2, drawCalls: 1,
      center: baked.center, frame: baked.frame, views: 4, textureDimensions: [2048, 2048],
      tileOpaquePixels: baked.tilePixels, tileBorderOpaquePixels: baked.borderAlpha,
      uvRects: [[0,.5,.5,1],[.5,.5,1,1],[0,0,.5,.5],[.5,0,1,.5]] };
    await license(`${output}/${file}`, 'impostor', 1);
    console.log('BAKED', entry.id, bytes.length);
  }
  await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(`${evidence}/inventory.json`, JSON.stringify(entries, null, 2) + '\n');
  const mature = entries.find(e => e.id.endsWith('mature'));
  await page.evaluate(id => window.__hr.single(id), mature.id);
  for (const [name, position, target] of [
    ['bark-close', [1.0, 1.7, 1.2], [0, 1.6, 0]],
    ['crown-close', [3.4, 8, 4.3], [0.3, 8.5, 0]],
  ]) {
    await page.evaluate(({ position, target }) => {
      const { camera, scene, renderer } = window.__casuarinaView;
      camera.position.fromArray(position); camera.lookAt(...target); renderer.render(scene, camera);
    }, { position, target });
    await page.screenshot({ path: `${evidence}/${name}.png` });
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); await server.close(); }
