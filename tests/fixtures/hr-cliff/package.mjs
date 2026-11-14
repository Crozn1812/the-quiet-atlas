import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';import{spawnSync}from'node:child_process';
import{dedup,prune,weld,meshopt,getTextureColorSpace}from'@gltf-transform/functions';import{KHRTextureBasisu}from'@gltf-transform/extensions';import{MeshoptEncoder}from'meshoptimizer';import{createIO,statistics}from'../../../tools/assets/shared.mjs';
const dir='tmp/hr-cliff',out='public/world/cliff';await mkdir(out,{recursive:true});await mkdir('test-results/hr-cliff',{recursive:true});const io=await createIO(),cache=new Map(),files=new Map(),report=[];
for(const lod of ['high','balanced']){
 const doc=await io.read(`${dir}/cliff-${lod}.glb`);
 // Blender exports the multiply-node pigment as COLOR_1 behind a white COLOR_0.
 // Three consumes COLOR_0; retain the actual wet/ledge pigment for rendering.
 for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
  const pigment=primitive.getAttribute('COLOR_1');
  if(pigment)primitive.setAttribute('COLOR_0',pigment).setAttribute('COLOR_1',null);
 }
 // The original sculpt is CC0. Keep a neutral stone albedo under the world's dawn lights.
 for(const mat of doc.getRoot().listMaterials())if(mat.getName().includes('stone'))mat.setBaseColorFactor([1,.94,.8,1]);
 for(const texture of doc.getRoot().listTextures()){
  const space=getTextureColorSpace(texture)??'linear';const kind=space==='srgb'?'color':texture.getName().includes('normal')?'normal':'orm';
  if(!cache.has(kind)){
   const input=`${dir}/pack-${kind}.png`,target=`${out}/cliff-${kind}.ktx2`;await writeFile(input,texture.getImage());
   const result=spawnSync('C:/Program Files/KTX-Software/bin/toktx.exe',['--t2','--encode','uastc','--uastc_quality','2','--threads','2','--zcmp','18','--genmipmap','--assign_oetf',space==='srgb'?'srgb':'linear',target,input],{windowsHide:true,encoding:'utf8'});
   if(result.status!==0)throw Error(result.stderr??result.error);cache.set(kind,await readFile(target));files.set(`cliff-${kind}.ktx2`,cache.get(kind).length);
  }
  texture.setImage(cache.get(kind)).setMimeType('image/ktx2').setURI(`cliff-${kind}.ktx2`);
 }
 doc.createExtension(KHRTextureBasisu).setRequired(true);await doc.transform(dedup(),prune(),weld(),meshopt({encoder:MeshoptEncoder}));
 const json=await io.writeJSON(doc,{format:'GLTF'});for(const image of json.json.images??[])delete json.resources[image.uri];
 const bin=json.resources[json.json.buffers[0].uri];delete json.json.buffers[0].uri;
 const j=Buffer.from(JSON.stringify(json.json)),jp=Buffer.alloc(Math.ceil(j.length/4)*4,32);j.copy(jp);const bp=Buffer.alloc(Math.ceil(bin.length/4)*4);Buffer.from(bin).copy(bp);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jp.length+bp.length,8);header.writeUInt32LE(jp.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(bp.length,0);bh.writeUInt32LE(0x004e4942,4);const glb=Buffer.concat([header,jp,bh,bp]);await writeFile(`${out}/cliff-${lod}.glb`,glb);files.set(`cliff-${lod}.glb`,glb.length);report.push({lod,...statistics(doc),bytes:glb.length});
}
const existing=await readFile('assets/LICENSES.csv','utf8');for(const[file]of files){const path=`${out}/${file}`;if(!existing.includes(path+','))await appendFile('assets/LICENSES.csv',`${path},The Quiet Atlas original sculpt / Poly Haven rock_face by Greg Zaal and Dario Barresi,CC0-1.0,yes,yes,yes,none,https://polyhaven.com/a/rock_face ; https://polyhaven.com/license ; https://creativecommons.org/publicdomain/zero/1.0/ ; tests/fixtures/hr-cliff/sculpt.py ; tools/assets/textures/cc0-sources.json,${file.endsWith('.ktx2')?'2048x2048':'-'},${file.endsWith('.glb')?2:'-'},${file.includes('balanced')?'Balanced':file.includes('high')?'High':'shared'},authored proxies\n`);}
await writeFile('test-results/hr-cliff/assets.json',JSON.stringify({report,files:[...files],totalBytes:[...files.values()].reduce((a,b)=>a+b,0)},null,2));console.log(JSON.stringify({report,files:[...files]}));


