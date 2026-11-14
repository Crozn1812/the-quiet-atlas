// Offline compression. Every image is shared between LODs, without network access.
import { readFile, writeFile, stat, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dedup, prune, weld, meshopt, getTextureColorSpace } from '@gltf-transform/functions';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO, statistics } from '../shared.mjs';

const temp = 'tmp/hr-props', output = 'public/world/lib';
const inventory = JSON.parse(await readFile(`${temp}/inventory.json`, 'utf8'));
const manifest = JSON.parse(await readFile(`${output}/manifest.json`, 'utf8'));
const io = await createIO(), compressed = new Map(), files = new Map();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function glb(json, binary) {
  const source = Buffer.from(JSON.stringify(json));
  const j = Buffer.alloc(Math.ceil(source.length / 4) * 4, 0x20); source.copy(j);
  const b = Buffer.alloc(Math.ceil(binary.length / 4) * 4); Buffer.from(binary).copy(b);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + j.length + b.length, 8); header.writeUInt32LE(j.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const bin = Buffer.alloc(8); bin.writeUInt32LE(b.length, 0); bin.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, j, bin, b]);
}
for (const entry of inventory) {
  for (const lod of entry.lods) {
    const document = await io.read(`${temp}/${lod.file}`);
    await document.transform(dedup(), prune(), weld());
    for (const texture of document.getRoot().listTextures()) {
      const color = getTextureColorSpace(texture) ?? 'linear';
      const key = sha(Buffer.concat([Buffer.from(texture.getImage()), Buffer.from(color)]));
      if (!compressed.has(key)) {
        const input = `${temp}/${key}.png`, target = `${temp}/${key}.ktx2`;
        try { compressed.set(key, await readFile(target)); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await writeFile(input, texture.getImage());
          const result = spawnSync('C:/Program Files/KTX-Software/bin/toktx.exe', [
            '--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--genmipmap', '--assign_oetf', color, target, input,
          ], { windowsHide: true, encoding: 'utf8' });
          if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
          compressed.set(key, await readFile(target));
        }
      }
      texture.setImage(compressed.get(key)).setMimeType('image/ktx2').setURI('');
    }
    document.createExtension(KHRTextureBasisu).setRequired(true);
    await document.transform(dedup(), meshopt({ encoder: MeshoptEncoder }));
    const encoded = await io.writeJSON(document, { format: 'GLTF' });
    const sharedTextures = [];
    for (const image of encoded.json.images ?? []) {
      const bytes = encoded.resources[image.uri], hash = sha(bytes);
      const file = `hr-prop-atlas-${hash.slice(0, 16)}.ktx2`; image.uri = file;
      if (!files.has(file)) { await writeFile(`${output}/${file}`, bytes); files.set(file, { materials: '-', level: 'shared', bytes: bytes.length }); }
      sharedTextures.push({ path: `/world/lib/${file}`, bytes: bytes.length, sha256: hash });
    }
    const binary = encoded.resources[encoded.json.buffers[0].uri]; delete encoded.json.buffers[0].uri;
    const target = `${output}/${lod.file}`; await writeFile(target, glb(encoded.json, binary));
    const metrics = statistics(document);
    Object.assign(lod, metrics, { drawCalls: document.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().length, 0),
      path: `/world/lib/${lod.file}`, bytes: (await stat(target)).size, sha256: sha(await readFile(target)), sharedTextures });
    files.set(lod.file, lod);
  }
  Object.assign(entry, { delivery: 'deferred-after-play', textureMaxDimension: 2048,
    integration: 'props/hr-props.ts; PBR instancing; High LOD0/LOD1 26m/21m hysteresis; Low procedural; no distant shadows' });
  console.log(entry.id, entry.lods.map(l => `${l.triangles}tri/${l.bytes}B`).join(' / '));
}
// Preserve all existing entries and metadata. Re-running replaces only this inventory.
manifest.assets = manifest.assets.filter(a => !inventory.some(e => e.id === a.id));
manifest.assets.push(...inventory);
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
const licenseText = await readFile('assets/LICENSES.csv', 'utf8');
// Remove only obsolete atlases owned by this generator after every GLB is rewritten.
for (const file of await readdir(output)) if (/^hr-prop-atlas-[a-f0-9]{16}\.ktx2$/.test(file) && !files.has(file)) await unlink(`${output}/${file}`);
const rows = licenseText.trimEnd().split('\n').filter(row => !row.startsWith(`${output}/hr-prop-atlas-`) && ![...files.keys()].some(file => row.startsWith(`${output}/${file},`)));
for (const [file, info] of files) rows.push(`${output}/${file},The Quiet Atlas original Blender geometry / Poly Haven CC0 photographs,CC0-1.0,yes,yes,yes,none,https://polyhaven.com/a/forest_floor; https://polyhaven.com/a/pine_bark; https://polyhaven.com/a/river_small_rocks; https://polyhaven.com/license; tools/assets/blender/hr-props.py,2048 KTX2 UASTC,${info.materials},${info.level === 'shared' ? 'shared' : `LOD${info.level}`},none`);
await writeFile('assets/LICENSES.csv', rows.join('\n') + '\n');
await writeFile(`${temp}/packaged.json`, JSON.stringify({ inventory, addedBytes: [...files.values()].reduce((s, f) => s + f.bytes, 0) }, null, 2));
console.log(`HR-PROPS packaged ${inventory.length} assets / ${files.size} public files`);
