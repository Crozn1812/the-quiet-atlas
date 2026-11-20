// Reproducible offline cargo steamer, metres/Y-up. No downloads.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BoxGeometry, CylinderGeometry, BufferGeometry, Float32BufferAttribute, Color } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Document } from '@gltf-transform/core';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO, statistics } from '../shared.mjs';
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [require.resolve('next/package.json')] }));
const temp = 'tmp/shipwreck', target = 'public/world/props/prop-shipwreck.glb';
await mkdir(temp, { recursive: true });
await mkdir('public/world/props', { recursive: true });
function run(exe, args) {
  const r = spawnSync(exe, args, { windowsHide: true, encoding: 'utf8' });
  if (r.error || r.status) throw new Error(r.error?.message ?? r.stderr);
}
// Reuse the repository's original CC0 weathered coastal coating, downsampled for distance.
run('C:/Program Files/KTX-Software/bin/ktx.exe', ['extract', '--transcode', 'rgba8', '--level', '2',
  'public/world/lib/hr-wood-ef91dab3c20954fb.ktx2', `${temp}/coating.png`]);
await sharp(`${temp}/coating.png`).resize(256, 256).png().toFile(`${temp}/paint.png`);
run('C:/Program Files/KTX-Software/bin/toktx.exe', ['--t2', '--encode', 'uastc', '--zcmp', '18', '--genmipmap',
  '--assign_oetf', 'srgb', `${temp}/paint.ktx2`, `${temp}/paint.png`]);
const parts = [];
function add(g, color, rust = false) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.getAttribute('position'), colors = [], uv = [];
  const paint = new Color(color), oxide = new Color('#79503b');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const stain = Math.sin(x * 1.8 + Math.sin(z * 2)) * Math.sin(y * 0.7 + x * 0.35);
    const c = paint.clone().lerp(oxide, rust ? Math.max(0, stain) * 0.85 : 0);
    colors.push(c.r, c.g, c.b); uv.push((x + z) / 17, y / 12);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); parts.push(g);
}
function box(x,y,z,w,h,d,c='#b3b1a0',rust=true) { add(new BoxGeometry(w,h,d,Math.max(1,Math.ceil(w/3)),2,2).translate(x,y,z),c,rust); }
function cylinder(x,y,z,r,h,c,open=false) { add(new CylinderGeometry(r,r*1.08,h,12,1,open).translate(x,y,z),c,true); }
// Five chine rings form a tapered steel hull with a raised, raked bow.
const stations = [[-36,2.5],[-32,5.2],[-23,6.6],[19,6.6],[29,4.9],[36,0.25]];
const vertices = [], indices = [];
for (const [x,w] of stations) vertices.push(x,-5,0, x,-3,-w*.7, x,3,-w, x,3,w, x,-3,w*.7);
for(let s=0;s<stations.length-1;s++) for(let k=0;k<5;k++) {
  const a=s*5+k,b=s*5+(k+1)%5,c=(s+1)*5+k,d=(s+1)*5+(k+1)%5;
  indices.push(a,b,c,b,d,c);
}
// End caps, all parts merged into one primitive/material/draw.
for (const s of [0,stations.length-1]) for(let k=1;k<4;k++) indices.push(s*5,s*5+k,s*5+k+1);
const hull = new BufferGeometry(); hull.setAttribute('position',new Float32BufferAttribute(vertices,3)); hull.setIndex(indices); hull.computeVertexNormals();
add(hull,'#a2aaa1',true);
box(-11,5,0,19,4,10); box(-7,8,0,10,2,8.8,'#c2c0ad');
box(-7,9.2,0,11,.45,10,'#555d59');
for(const side of [-1,1]) for(let x=-10;x<=-4;x+=2) box(x,8.2,side*4.45,1.35,.85,.08,'#263b3b',false);
for(const x of [-1,18]) { box(x,3.5,0,11,1,9,'#62645b'); box(x,4.1,0,10,.22,8,'#919587'); }
cylinder(-8,12,0,1.55,6,'#74746a',true); cylinder(-8,15.1,0,1.7,.65,'#343c39',true);
box(-8,14.9,0,2.6,.1,2.6,'#232c2b',false); // black recessed funnel opening
cylinder(25,8,0,.24,10,'#74796a'); box(25,11,0,.25,.22,9,'#73766b');
for(const side of [-1,1]) {
  for(let x=-29;x<29;x+=4) box(x,3.8,side*5.8,.12,1.6,.12,'#7c8178');
  box(0,4.5,side*5.8,57,.13,.13,'#92968a');
  for(let x=7;x<29;x+=4) cylinder(x,2.1,side*6.45,.27,.14,'#364a46');
}
const geometry=mergeGeometries(parts); parts.forEach(g=>g.dispose());
const doc=new Document(), buffer=doc.createBuffer();
const primitive=doc.createPrimitive();
for(const [name,semantic] of [['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0'],['color','COLOR_0']]) {
  const a=geometry.getAttribute(name);
  primitive.setAttribute(semantic,doc.createAccessor().setType(a.itemSize===2?'VEC2':'VEC3').setArray(new Float32Array(a.array)).setBuffer(buffer));
}
const texture=doc.createTexture('reused-cc0-coastal-coating').setImage(await readFile(`${temp}/paint.ktx2`)).setMimeType('image/ktx2');
const material=doc.createMaterial('faded-steel-and-oxide').setBaseColorTexture(texture).setRoughnessFactor(.94).setMetallicFactor(.08).setDoubleSided(true);
material.getBaseColorTextureInfo().setWrapS(10497).setWrapT(10497);
primitive.setMaterial(material);
doc.createExtension(KHRTextureBasisu).setRequired(true);
doc.createScene().addChild(doc.createNode('unmarked-cargo-steamer-72m').setMesh(doc.createMesh().addPrimitive(primitive)));
await doc.transform(weld(),meshopt({encoder:MeshoptEncoder}));
const io=await createIO(); await io.write(target,doc);
const report={file:target,bytes:(await readFile(target)).length,...statistics(doc),drawCalls:1,lengthMetres:72,pitchDegrees:20,source:'CC0 coastal-coating hr-wood-ef91dab3c20954fb.ktx2; original code geometry'};
await writeFile('tools/assets/blender/shipwreck-metrics.json',JSON.stringify(report,null,2)+'\n'); console.log(report);
