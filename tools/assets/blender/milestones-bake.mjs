// Bake the approved 19-joint character at Walk t=0.18s. No Blender/native tools or downloads.
// Run: node tools/assets/blender/milestones-bake.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { AnimationMixer, Box3, Float32BufferAttribute, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { Document } from '@gltf-transform/core';
import { dedup, weld, prune } from '@gltf-transform/functions';
import { createIO, statistics } from '../shared.mjs';

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
const io = await createIO(), output = 'public/world/milestones/character-milestones-walk.glb';
await mkdir('public/world/milestones', { recursive: true }); await io.write(output, doc);
const report = { ...statistics(doc), bytes: (await readFile(output)).length, bounds: new Box3().setFromBufferAttribute(positions), source, clip: walk.name, seconds: .18, bones: 19 };
await mkdir('tmp/ms-c', { recursive: true });
await writeFile('tmp/ms-c/bake.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
