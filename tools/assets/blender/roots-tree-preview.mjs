// Isolated asset evidence complements the in-world shots (the surrounding forest is unchanged).
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';
const dest = 'test-results/qf-04';
await mkdir(dest, { recursive: true });
const baseline = execFileSync('git', ['show', 'HEAD:public/world/roots/roots-tree-lod0.glb'], { maxBuffer: 10_000_000 });
await writeFile(`${dest}/baseline.glb`, baseline);
const html = `<!doctype html><style>body{margin:0}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/vendor/build/three.module.js","three/addons/":"/vendor/examples/jsm/"}}</script>
<script type="module">
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const renderer=new T.WebGLRenderer({antialias:true}); renderer.setSize(1600,1000); renderer.setPixelRatio(1);
renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1; document.body.append(renderer.domElement);
const scene=new T.Scene(); scene.background=new T.Color('#c5d1ca');
scene.add(new T.HemisphereLight('#eaf5ff','#817558',2));
const sun=new T.DirectionalLight('#fff2cd',3);sun.position.set(8,20,12);scene.add(sun);
const ground=new T.Mesh(new T.PlaneGeometry(160,160),new T.MeshStandardMaterial({color:'#807663',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.05;scene.add(ground);
// Exactly 25 m from the same bole origin, with fixed framing and lighting for both assets.
const camera=new T.OrthographicCamera(-35.2,35.2,22,-22,.1,200);camera.position.set(21.8,13.564659966250536,0);camera.lookAt(.8,14,0);
const ktx=new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
const loader=new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
loader.register(()=>({name:'KHR_materials_diffuse_transmission'}));
const mode=window.__qfMode;
const {scene:tree}=await loader.loadAsync('/world/roots/'+(mode==='before'?'baseline.glb':'roots-tree-lod0.glb'));
tree.traverse(o=>{if(o.isMesh && o.material.name==='roots-tree-leaves')o.material.emissive.setRGB(.005,.009,.002);});
scene.add(tree);renderer.render(scene,camera);window.ready={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,camera:camera.position.toArray(),target:[.8,14,0],projection:"orthographic silhouette; separate from in-world evidence"};ktx.dispose();
</script>`;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
    if (path === '/world/roots/baseline.glb') { res.end(baseline); return; }
    const root = resolve(path.startsWith('/vendor/') ? 'node_modules/three' : 'public');
    const file = resolve(root, '.' + (path.startsWith('/vendor/') ? path.slice(7) : path));
    if (!file.startsWith(root + sep)) throw Error('Outside preview root');
    res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(4303, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = {};
try {
  for (const mode of ['before','after']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', e => console.error(e.message));
    await page.addInitScript(value => { window.__qfMode = value; }, mode);
    await page.goto('http://127.0.0.1:4303/');
    await page.waitForFunction(() => window.ready, { timeout: 120000 });
    report[mode] = await page.evaluate(() => window.ready);
    await page.screenshot({ path: `${dest}/${mode}/asset-full-25m-high.png` });
    await page.close();
  }
  await writeFile(`${dest}/asset-preview.json`, JSON.stringify(report, null, 2));
  console.log(report);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
