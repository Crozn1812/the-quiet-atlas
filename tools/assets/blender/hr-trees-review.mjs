// Capture final compressed assets in installed Edge; bake four-view impostors.
import { readFile, writeFile, stat, appendFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { Document } from '@gltf-transform/core';
import { KHRTextureBasisu, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO } from '../shared.mjs';

const evidence='tools/assets/blender/hr-trees-review';
await mkdir(evidence,{recursive:true});
const io=await createIO();
const manifest=JSON.parse(await readFile('public/world/lib/manifest.json','utf8'));
const entries=manifest.assets.filter(a=>a.id.startsWith('hr-tree-'));
const server=await createServer({server:{host:'127.0.0.1',port:4197,strictPort:true},plugins:[{
  name:'hr-trees-review',configureServer(s){s.middlewares.use('/hr-trees.html',(_req,res)=>{
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>HR tree asset review</title><script type="module" src="/tools/assets/blender/hr-trees-viewer.mjs"></script>');
  });},
}]});
await server.listen();
let browser;
const errors=[];
try {
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.goto('http://127.0.0.1:4197/hr-trees.html');
  await page.waitForFunction(()=>window.__hr,{timeout:60000});
  const report={browser:'installed Edge; SwiftShader; asset viewer, not game/Iris Xe',errors,captures:[],abba:[]};
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  for(const entry of entries) {
    const high=await page.evaluate(id=>window.__hr.single(id),entry.id);
    await page.screenshot({path:`${evidence}/${entry.id}-high.png`});
    report.captures.push({id:entry.id,...high});
    const baked=await page.evaluate(id=>window.__hr.bake(id),entry.id);
    const raw=`tmp/hr-trees/${entry.id}-impostor.png`,target=`tmp/hr-trees/${entry.id}-impostor.ktx2`;
    await writeFile(raw,Buffer.from(baked.png,'base64'));
    const encoded=spawnSync('C:/Program Files/KTX-Software/bin/toktx.exe',[
      '--t2','--encode','uastc','--uastc_quality','2','--zcmp','18','--genmipmap','--assign_oetf','srgb',target,raw,
    ],{windowsHide:true,encoding:'utf8'});
    if(encoded.error || encoded.status!==0) throw new Error(encoded.error?.message??encoded.stderr);
    const doc=new Document(),buffer=doc.createBuffer();
    const [cx,cy,cz]=baked.center,f=baked.frame/2;
    const pos=doc.createAccessor().setType('VEC3').setArray(new Float32Array([
      cx-f,cy-f,cz,cx+f,cy-f,cz,cx-f,cy+f,cz,cx+f,cy+f,cz,
    ])).setBuffer(buffer);
    const uv=doc.createAccessor().setType('VEC2').setArray(new Float32Array([0,1,.5,1,0,.5,.5,.5])).setBuffer(buffer);
    const indices=doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0,1,2,2,1,3])).setBuffer(buffer);
    const tex=doc.createTexture().setImage(await readFile(target)).setMimeType('image/ktx2');
    doc.createExtension(KHRTextureBasisu).setRequired(true);
    const unlit=doc.createExtension(KHRMaterialsUnlit);
    const material=doc.createMaterial('baked-four-view').setBaseColorTexture(tex).setAlphaMode('MASK').setAlphaCutoff(.32).setDoubleSided(true).setExtension('KHR_materials_unlit',unlit.createUnlit());
    const mesh=doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION',pos).setAttribute('TEXCOORD_0',uv).setIndices(indices).setMaterial(material));
    const node=doc.createNode(entry.id+'-impostor').setMesh(mesh).setExtras({billboard:true,views:4});
    doc.createScene().addChild(node);
    await doc.transform(meshopt({encoder:MeshoptEncoder}));
    const file=entry.id+'-impostor.glb',path='public/world/lib/'+file;
    await io.write(path,doc);
    entry.bounds=baked.bounds;
    entry.impostor={file,path:'/world/lib/'+file,bytes:(await stat(path)).size,triangles:2,drawCalls:1,
      sha256:createHash('sha256').update(await readFile(path)).digest('hex'),textureDimensions:[2048,2048],
      views:4,azimuthDegrees:[0,90,180,270],center:baked.center,frame:baked.frame,
      tileOpaquePixels:baked.tilePixels,tileBorderOpaquePixels:baked.borderAlpha,
      uvRects:[[0,.5,.5,1],[.5,.5,1,1],[0,0,.5,.5],[.5,0,1,.5]],
      usage:'Choose nearest azimuth; update UV rectangle; yaw billboard around recorded center. Baked light; no shadow casting.'};
    const csv=await readFile('assets/LICENSES.csv','utf8');
    if(!csv.includes(path+','))await appendFile('assets/LICENSES.csv',`${path},Poly Haven / The Quiet Atlas original bake,CC0-1.0,yes,yes,yes,none,https://polyhaven.com/a/pine_bark; https://polyhaven.com/a/forest_floor; https://polyhaven.com/license; tools/assets/blender/hr-trees.py,2048 KTX2 UASTC,1,impostor,none\n`);
    console.info('BAKED',entry.id,entry.impostor.bytes);
  }
  await writeFile('public/world/lib/manifest.json',JSON.stringify(manifest,null,2)+'\n');
  // Reload metadata so the same viewer can now inspect the shipped impostor.
  await page.reload();await page.waitForFunction(()=>window.__hr);
  const id=entries[0].id;
  await page.evaluate(id=>window.__hr.single(id,0,true),id);
  await page.screenshot({path:`${evidence}/before-high.png`});
  await page.evaluate(id=>window.__hr.single(id),id);
  await page.screenshot({path:`${evidence}/after-high.png`});
  report.low=await page.evaluate(id=>window.__hr.single(id,2),id);
  await page.screenshot({path:`${evidence}/low-impostor.png`});
  for(const variant of ['A','B','B','A']) {
    await page.evaluate(({id,variant})=>window.__hr.single(id,0,variant==='A'),{id,variant});
    const cpu=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value])).TaskDuration;
    const start=await cpu();const timing=await page.evaluate(()=>window.__hr.sample());const end=await cpu();
    report.abba.push({variant,...timing,cpuMsPerSecond:(end-start)*1000/timing.elapsedSeconds});
  }
  if(errors.length)throw new Error(errors.join('\n'));
  const rows=entries.map(e=>`| ${e.id} | ${e.lods.map(l=>l.triangles).join(' / ')} / 2 | ${e.lods.map(l=>l.drawCalls).join(' / ')} / 1 | ${[...e.lods,e.impostor].map(l=>l.bytes).join(' / ')} |`);
  await writeFile(`${evidence}/table.md`,'| Tree | Tri LOD0 / LOD1 / impostor | Draw | Bytes |\n|---|---:|---:|---:|\n'+rows.join('\n')+'\n');
  report.glbBytes=entries.reduce((s,e)=>s+e.impostor.bytes+e.lods.reduce((s,l)=>s+l.bytes,0),0);
  const shared=new Map(entries.flatMap(e=>e.lods.flatMap(l=>l.sharedTextures??[])).map(t=>[t.path,t.bytes]));
  report.sharedTextureBytes=[...shared.values()].reduce((s,b)=>s+b,0);
  report.totalBytes=report.glbBytes+report.sharedTextureBytes;
  await writeFile(`${evidence}/metrics.json`,JSON.stringify(report,null,2)+'\n');
  await writeFile(`${evidence}/inventory.json`,JSON.stringify(entries,null,2)+'\n');
  console.info('HR final bytes:',report.totalBytes);
} finally { await browser?.close();await server.close(); }
