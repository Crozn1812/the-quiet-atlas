// Inspect delivered HR-CHAR assets without re-encoding them.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createIO } from '../shared.mjs';

const manifest = JSON.parse(await readFile('public/world/character/hr-manifest.json', 'utf8'));
const io = await createIO();
const reference = (await io.read('public/world/start/character-duy.glb')).getRoot().listSkins()[0];
const binds = reference.getInverseBindMatrices().getArray();
for (const lod of manifest.lods) {
  const bytes = await readFile(lod.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), lod.sha256);
  const root = (await io.read(lod.file)).getRoot();
  const actual = root.listSkins()[0].getInverseBindMatrices().getArray();
  const bindDrift = Math.max(...Array.from(actual, (value, index) => Math.abs(value - binds[index])));
  assert.ok(bindDrift < 1e-6, `${lod.file}: changed inverse binds (${bindDrift})`);
  for (const mesh of root.listMeshes()) {
    assert.deepEqual(mesh.getWeights(), [0]);
    let moved = 0;
    for (const primitive of mesh.listPrimitives()) {
      assert.equal(primitive.getAttribute('POSITION').getArray().constructor.name, 'Float32Array');
      assert.equal(primitive.listTargets().length, 1);
      const target = primitive.listTargets()[0].getAttribute('POSITION').getArray();
      assert.ok(Array.from(target).every(Number.isFinite));
      moved += Array.from(target).filter(value => Math.abs(value) > .0001).length;
    }
    assert.ok(moved > 100, `${lod.file}: missing anatomical grip`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binOffset = 20 + jsonLength + 8;
  const maps = [];
  for (const material of gltf.materials) {
    if (!material.normalTexture) continue;
    const texture = gltf.textures[material.normalTexture.index];
    const image = gltf.images[texture.extensions.KHR_texture_basisu.source];
    const view = gltf.bufferViews[image.bufferView];
    const ktx = bytes.subarray(binOffset + (view.byteOffset ?? 0), binOffset + (view.byteOffset ?? 0) + view.byteLength);
    const offset = ktx.readUInt32LE(56), length = ktx.readUInt32LE(60);
    const metadata = ktx.subarray(offset, offset + length).toString();
    assert.equal(metadata.includes('--normal_mode'), false, `${lod.file}: ${material.name} normal_mode`);
    assert.equal(metadata.includes('rrrg'), false, `${lod.file}: ${material.name} swizzle`);
    maps.push({ material: material.name, metadata });
  }
  const cornea = gltf.materials.find(m => m.name === 'cornea');
  assert.equal(cornea.pbrMetallicRoughness.baseColorFactor[3], .06);
  console.log(JSON.stringify({ file: lod.file, bytes: bytes.length, sha256: lod.sha256, cornea, normalMaps: maps }));
}
