// Verify final shader against real shipped quadrant UVs without a second Next build.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'test-results/hr-tree2/impostor-fixed';
await mkdir(directory, { recursive: true });
const server = await createServer({ configFile: false, root: process.cwd(), publicDir: 'public', server: { host: '127.0.0.1', port: 0 } });
server.middlewares.use('/hr-impostor-review', (_req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(`<link rel="icon" href="data:,"><style>body{margin:0;background:#8ca9bb}canvas{display:block}</style><script type="module">
import * as T from '/node_modules/three/build/three.module.js';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from '/node_modules/three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from '/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js';
import { installHrMaterial } from '/src/features/world/foliage/hr-material.ts';
import { readHrParts } from '/src/features/world/foliage/hr-library.ts';
const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,700);renderer.setClearColor(0,0);document.body.append(renderer.domElement);
const ktx=new KTX2Loader().setWorkerLimit(1).setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').detectSupport(renderer);
const loader=new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
const manifest=await fetch('/world/lib/manifest.json').then(r=>r.json());const meta=manifest.assets.find(a=>a.id==='hr-tree-spreading-crown');
const gltf=await loader.loadAsync(meta.impostor.path);const part=readHrParts(gltf.scene)[0], geometry=part.geometry;
geometry.setAttribute('hrTint',new T.InstancedBufferAttribute(new Float32Array([1,1,1]),3));geometry.setAttribute('hrSeed',new T.InstancedBufferAttribute(new Float32Array([0]),1));geometry.setAttribute('hrFade',new T.InstancedBufferAttribute(new Float32Array([1]),1));
const material=part.material;installHrMaterial(material,new T.Vector2(0,0),true,false,true);const hook=material.onBeforeCompile;const center=new T.Vector3().fromArray(meta.impostor.center);material.onBeforeCompile=(shader,r)=>{hook(shader,r);shader.uniforms.hrCenter={value:center}};
const mesh=new T.InstancedMesh(geometry,material,1);mesh.setMatrixAt(0,new T.Matrix4());const scene=new T.Scene();scene.add(mesh);const camera=new T.PerspectiveCamera(38,900/700,0.1,200);
window.hrReview={view(angle){camera.position.copy(center).add(new T.Vector3(Math.sin(angle)*54,2,Math.cos(angle)*54));camera.lookAt(center);renderer.render(scene,camera);const gl=renderer.getContext(), pixels=new Uint8Array(900*700*4);gl.readPixels(0,0,900,700,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let opaque=0,border=0;for(let y=0;y<700;y++)for(let x=0;x<900;x++){if(pixels[(y*900+x)*4+3]>127){opaque++;if(x<2||x>897||y<2||y>697)border++}}return {opaque,border,triangles:renderer.info.render.triangles,draws:renderer.info.render.calls}}};
</script>`);
});
const reviewMiddleware = server.middlewares.stack.pop();
server.middlewares.stack.unshift(reviewMiddleware);
await server.listen();
const browser = await chromium.launch({ headless: false, channel: 'msedge' });
const errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/hr-impostor-review`);
  await page.waitForFunction(() => Boolean(window.hrReview), { timeout: 60000 });
  for (let view = 0; view < 4; view++) {
    const result = await page.evaluate(angle => window.hrReview.view(angle), view * Math.PI / 2);
    results.push({ view, ...result });
    await page.screenshot({ path: `${directory}/view-${view}.png` });
  }
  await writeFile(`${directory}/metrics.json`, JSON.stringify({ errors, results }, null, 2));
  if (errors.length || results.some(r => r.opaque < 1000 || r.border !== 0)) throw new Error('Impostor validation failed');
  console.log(JSON.stringify({ errors, results }));
} finally { await browser.close(); await server.close(); }
