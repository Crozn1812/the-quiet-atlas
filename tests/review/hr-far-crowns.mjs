// Isolated hardware review of pooled 3D crowns, all azimuths; no atlas cards.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const dir = 'test-results/hr-far/crowns';
await mkdir(dir, { recursive: true });
const server = await createServer({ configFile: false, optimizeDeps: { exclude: ['three'] },
  server: { host: '127.0.0.1', port: 4577, strictPort: true, hmr: false },
  plugins: [{ name: 'far-atlas-review', configureServer(s) { s.middlewares.use('/atlas.html', (_req,res) => {
    res.setHeader('Content-Type','text/html'); res.end(`<!doctype html><link rel="icon" href="data:,"><style>body{margin:0}</style><script type="module">
import * as T from '/node_modules/three/build/three.module.js';
import {createFarForest} from '/src/features/world/scene/far-forest.ts';
const renderer = new T.WebGLRenderer({antialias:true}); renderer.setSize(1200,600); document.body.append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#9bbbd0');
const camera=new T.PerspectiveCamera(45,2,.1,200);camera.position.set(0,9,42);camera.lookAt(0,4,0);
const parent=new T.Mesh();scene.add(parent);
const ids=['hr-tree-spreading-crown','hr-tree-umbrella-crown','hr-tree-bamboo-clump'];
const sites=ids.map((id,i)=>({x:(i-1)*14,z:0,y:0,height:8,id,yaw:0}));
const forest=createFarForest(parent,sites,0,0,{value:0});forest.start(renderer);
window.__atlas={scene,renderer,camera,forest};
function frame(){renderer.render(scene,camera);requestAnimationFrame(frame)}frame();
</script>`);
  }); } }] });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const errors=[];
try {
  const page = await browser.newPage({viewport:{width:1200,height:600}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:4577/atlas.html');
  await page.waitForFunction(()=>window.__atlas?.forest.group.children.length>=3,{},{timeout:120000});
  for(let i=0;i<8;i++) {
    await page.evaluate(i=>{const a=window.__atlas,angle=i*Math.PI/4;a.camera.position.set(Math.sin(angle)*42,9,Math.cos(angle)*42);a.camera.lookAt(0,4,0);},i);
    await page.waitForTimeout(200);
    await page.screenshot({path:`${dir}/yaw-${i*45}.png`});
  }
  const resources = await page.evaluate(()=>window.__atlas.forest.group.children.map(m=>({
    name:m.name,triangles:m.geometry.getAttribute('position').count/3,
    geometryBytes:Object.values(m.geometry.attributes).reduce((s,a)=>s+a.array.byteLength,0),
    instanceBytes:m.instanceMatrix.array.byteLength,
  })));
  await writeFile(`${dir}/resources.json`,JSON.stringify(resources,null,2));
  await writeFile(`${dir}/errors.json`,JSON.stringify(errors));
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Far 3D crowns: 8 azimuths captured, zero shader/page errors');
} finally {await browser.close();await server.close();}
