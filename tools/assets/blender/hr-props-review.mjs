// Decode the delivered GLBs in Edge; inspect High/LOD1, not authoring meshes.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = 'test-results/hr-props/assets'; await mkdir(directory, { recursive: true });
await writeFile('tmp/hr-props/viewer.html', `<!doctype html><link rel="icon" href="data:,"><style>body{margin:0;background:#d7dfd5}canvas{display:block}.label{position:absolute;color:#263b30;font:13px Arial}</style><script type="module">
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1600,1280);renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const ktx=new KTX2Loader().setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').setWorkerLimit(1).detectSupport(renderer);
const loader=new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
const entries=(await (await fetch('/world/lib/manifest.json')).json()).assets.filter(a=>/^hr-(prop|rock|palm)-/.test(a.id));
window.renderLod=async level=>{
renderer.setScissorTest(true);const report=[];
for(const [index,entry] of entries.entries()){
 const scene=new T.Scene();scene.background=new T.Color('#d7dfd5');
 const {scene:model}=await loader.loadAsync(entry.lods[level].path);const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());const scale=2.4/Math.max(...size.toArray());model.scale.setScalar(scale);model.position.copy(center).multiplyScalar(-scale);scene.add(model);
 scene.add(new T.HemisphereLight('#d8e7f5','#566447',2.0));const sun=new T.DirectionalLight('#fff1d7',3.0);sun.position.set(3,5,4);scene.add(sun);
 const camera=new T.PerspectiveCamera(34,1,.1,50);camera.position.set(3,1.8,4);camera.lookAt(0,0,0);
 renderer.setViewport(index%5*320,1280-(Math.floor(index/5)+1)*320,320,320);renderer.setScissor(index%5*320,1280-(Math.floor(index/5)+1)*320,320,320);renderer.render(scene,camera);
 const label=document.createElement('div');label.className='label';label.style.left=index%5*320+8+'px';label.style.top=Math.floor(index/5)*320+300+'px';label.textContent=entry.id;document.body.append(label);
 report.push({id:entry.id,level,triangles:renderer.info.render.triangles,calls:renderer.info.render.calls});
 model.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
}return report;};window.result=await window.renderLod(0);window.ready=true;
</script>`);
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 4199, strictPort: true } }); await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1280 }, deviceScaleFactor: 1 }); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:4199/tmp/hr-props/viewer.html'); await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
  const lod0 = await page.evaluate(() => window.result); await page.screenshot({ path: `${directory}/lod0.png` });
  const lod1 = await page.evaluate(() => window.renderLod(1)); await page.screenshot({ path: `${directory}/lod1.png` });
  await writeFile(`${directory}/validation.json`, JSON.stringify({ lod0, lod1, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Decoded ${lod0.length + lod1.length} GLBs; browser errors: 0`);
} finally { await browser.close(); await server.close(); }
