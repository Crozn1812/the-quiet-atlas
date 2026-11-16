// Inspect delivered HR-CHAR assets without re-encoding them.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/world/character/hr-manifest.json', 'utf8'));
for (const lod of manifest.lods) {
  const bytes = await readFile(lod.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), lod.sha256);
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
