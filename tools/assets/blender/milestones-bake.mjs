import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { AnimationMixer, Box3, Float32BufferAttribute, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { Document } from '@gltf-transform/core';
import { dedup, weld, prune } from '@gltf-transform/functions';
import { createIO, statistics } from '../shared.mjs';
// --source freezes the approved character; the default packages the Blender result.
if (process.argv.includes("--source")) {
// Bake the approved 19-joint character at Walk t=0.18s. No Blender/native tools or downloads.
// Run: node tools/assets/blender/milestones-bake.mjs

globalThis.ProgressEvent ??= class { constructor(type, props) { this.type = type; Object.assign(this, props); } };
const source = 'public/world/character/character-duy-c.glb';
const bytes = await readFile(source);
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const rigBytes = await readFile('public/world/start/character-duy.glb');
const rig = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(rigBytes.buffer.slice(rigBytes.byteOffset, rigBytes.byteOffset + rigBytes.byteLength), '');
const walk = rig.animations.find(clip => /walk/i.test(clip.name));
if (!walk) throw new Error('Missing approved Walk clip');
const mixer = new AnimationMixer(gltf.scene);
mixer.clipAction(walk).play(); mixer.setTime(.18);
gltf.scene.updateMatrixWorld(true);
const skins = []; gltf.scene.traverse(node => { if (node instanceof SkinnedMesh) skins.push(node); });
if (skins.length !== 1 || skins[0].skeleton.bones.length !== 19) throw new Error('Expected approved 19-joint skin');
const skin = skins[0]; skin.skeleton.update();
const geometry = skin.geometry.clone();
const original = geometry.getAttribute('position');
const positions = new Float32BufferAttribute(original.count * 3, 3), point = new Vector3();
geometry.setAttribute('position', positions);
for (let i = 0; i < positions.count; i++) {
  point.fromBufferAttribute(original, i); skin.applyBoneTransform(i, point); point.applyMatrix4(skin.matrixWorld);
  positions.setXYZ(i, point.x, point.y, point.z);
}
geometry.computeBoundingBox();
const bounds = geometry.boundingBox.clone(), scale = 5.9 / bounds.getSize(new Vector3()).y;
geometry.translate(0, -bounds.min.y, 0); geometry.scale(scale, scale, scale);
// Source normals are normalized integer attributes. Accumulating face normals
// into those quantized buffers overflows before normalization; bake into float.
geometry.deleteAttribute('normal'); geometry.computeVertexNormals();
const doc = new Document(), buffer = doc.createBuffer();
const attr = (name, type, array) => doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
const primitive = doc.createPrimitive()
  .setAttribute('POSITION', attr('baked-walk-position', 'VEC3', new Float32Array(positions.array)))
  .setAttribute('NORMAL', attr('baked-walk-normal', 'VEC3', new Float32Array(geometry.getAttribute('normal').array)))
  .setIndices(attr('indices', 'SCALAR', new Uint32Array(geometry.index.array)));
const node = doc.createNode('Milestones frozen Walk').setMesh(doc.createMesh().addPrimitive(primitive));
doc.createScene().addChild(node);
doc.getRoot().setExtras({ source, bones: 19, clip: walk.name, seconds: .18, static: true });
await doc.transform(dedup(), weld(), prune());
const io = await createIO(), output = 'tmp/ms-c2/character-walk.glb';
await mkdir('tmp/ms-c2', { recursive: true }); await io.write(output, doc);
await writeFile('tmp/ms-c2/character-walk-pose.json', JSON.stringify(Object.fromEntries(skin.skeleton.bones.map(bone => {
  bone.getWorldPosition(point); point.y -= bounds.min.y; point.multiplyScalar(scale);
  return [bone.name, point.toArray()];
})), null, 2));
const report = { ...statistics(doc), bytes: (await readFile(output)).length, bounds: new Box3().setFromBufferAttribute(positions), source, clip: walk.name, seconds: .18, bones: 19 };
await mkdir('tmp/ms-c', { recursive: true });
await writeFile('tmp/ms-c/bake.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

} else {
// Bake the original projected Voronoi repair mask once, rather than evaluating
// nine hashed cells (18 sin calls) per body fragment on the integrated GPU.
const size = 1024, raster = Buffer.alloc((size + 1) * size);
const hash = (x, y, a, b) => { const n = Math.sin(x * a + y * b) * 43758.5453; return n - Math.floor(n); };
const cells = new Map();
const cell = (x, y) => {
  const key = `${x}/${y}`;
  if (!cells.has(key)) cells.set(key, [hash(x,y,127.1,311.7), hash(x,y,269.5,183.3)]);
  return cells.get(key);
};
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const px = ((x + .5) / size - .5) * 16, py = (y + .5) / size * 16;
  const u = px + .10 * Math.sin(py * 8 + Math.sin(px * 3));
  const v = py + .10 * Math.sin(px * 8 + Math.sin(py * 3));
  const cx = Math.floor(u), cy = Math.floor(v), fx = u - cx, fy = v - cy;
  let first = 8, second = 8;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const h = cell(cx+i,cy+j), dx = i+h[0]-fx, dy = j+h[1]-fy, d = dx*dx+dy*dy;
    if (d < first) { second = first; first = d; } else second = Math.min(second,d);
  }
  const t = Math.max(0, Math.min(1, (second-first-.010)/.023));
  raster[y * (size + 1) + x + 1] = Math.round((1-t*t*(3-2*t))*255);
}
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let n = i; for (let j = 0; j < 8; j++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0); return n >>> 0;
});
const chunk = (name, data) => {
  const bytes = Buffer.concat([Buffer.from(name), data]), output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length); bytes.copy(output,4);
  let crc = 0xffffffff; for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4); return output;
};
const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size,4); header[8] = 8;
await writeFile('public/world/milestones/kintsugi-mask.png', Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',header), chunk('IDAT',deflateSync(raster)), chunk('IEND',Buffer.alloc(0)),
]));
// Package the original Blender subdivision study. First run milestones-sculpt.py.
// No character/rig changes, external imagery, skinning or runtime animation clips.

const io = await createIO();
const document = await io.read('tmp/ms-c2/sculpt.glb');
const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
const position = primitive.getAttribute('POSITION');
const array = position.getArray();
let bottom = Infinity, top = -Infinity;
for (let i = 1; i < array.length; i += 3) { bottom = Math.min(bottom, array[i]); top = Math.max(top, array[i]); }
const scale = 5.9 / (top - bottom);
for (let i = 0; i < array.length; i += 3) {
  array[i] *= scale; array[i + 1] = (array[i + 1] - bottom) * scale; array[i + 2] *= scale;
}
position.setArray(array);
// Retain Blender UVs for the baked cloth normal map.
// Blender stores AO/pigment as float RGBA; compact normalized RGB is sufficient.
const color = primitive.getAttribute('COLOR_0');
if (color) {
  const rgb = new Uint8Array(color.getCount() * 3), value = [];
  for (let i = 0; i < color.getCount(); i++) {
    color.getElement(i, value);
    rgb.set(value.slice(0, 3).map(c => Math.round(c * 255)), i * 3);
  }
  const accessor = document.createAccessor('Sculpt AO').setType('VEC3').setArray(rgb).setNormalized(true).setBuffer(position.getBuffer());
  primitive.setAttribute('COLOR_0', accessor);
}
document.getRoot().setExtras({ author: 'The Quiet Atlas', source: 'tools/assets/blender/milestones-sculpt.py',
  static: true, pose: 'walking', subdivision: true, anonymous: true, height: 5.9, characterSource: 'public/world/character/character-duy-c.glb', walkSeconds: .18 });
await document.transform(dedup(), weld(), prune());
const output = 'public/world/milestones/character-milestones-walk.glb';
await io.write(output, document);
const report = { ...statistics(document), bytes: (await readFile(output)).length, height: 5.9, static: true };
await mkdir('test-results/ms-c2', { recursive: true });
await writeFile('test-results/ms-c2/bake.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

}
