// HR-FIX-SETPIECE step 3/3: tmp GLBs -> meshopt GLBs with shared external KTX2 (UASTC) in public/world/lib.
// Offline; re-running replaces only the files, manifest entries and licence rows this ticket owns.
import { readFile, writeFile, stat, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dedup, prune, weld, meshopt, getTextureColorSpace } from '@gltf-transform/functions';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO, statistics } from '../shared.mjs';

const temp = 'tmp/hr-fix-setpiece', output = 'public/world/lib';
const inventory = JSON.parse(await readFile(`${temp}/inventory.json`, 'utf8'));
const sources = JSON.parse(await readFile(`${temp}/sources.json`, 'utf8'));
const manifest = JSON.parse(await readFile(`${output}/manifest.json`, 'utf8'));
const io = await createIO(), compressed = new Map(), files = new Map();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const proof = [...sources.map(s => s.source), 'https://polyhaven.com/license', 'https://creativecommons.org/publicdomain/zero/1.0/'];

function glb(json, binary) {
  const source = Buffer.from(JSON.stringify(json));
  const j = Buffer.alloc(Math.ceil(source.length / 4) * 4, 0x20); source.copy(j);
  const b = Buffer.alloc(Math.ceil(binary.length / 4) * 4); Buffer.from(binary).copy(b);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + j.length + b.length, 8); header.writeUInt32LE(j.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const bin = Buffer.alloc(8); bin.writeUInt32LE(b.length, 0); bin.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, j, bin, b]);
}
const assets = [];
for (const entry of inventory) {
  const document = await io.read(`${temp}/glb/${entry.file}`);
  // Blender writes a zero-weight clearcoat on every material; keep the lacquer only where authored.
  for (const material of document.getRoot().listMaterials()) {
    const coat = material.getExtension('KHR_materials_clearcoat');
    if (coat && coat.getClearcoatFactor() === 0) material.setExtension('KHR_materials_clearcoat', null);
  }
  await document.transform(dedup(), prune(), weld());
  let dimension = 0;
  for (const texture of document.getRoot().listTextures()) {
    const color = getTextureColorSpace(texture) ?? 'linear';
    dimension = Math.max(dimension, ...(texture.getSize() ?? [0]));
    const key = sha(Buffer.concat([Buffer.from(texture.getImage()), Buffer.from(color)]));
    if (!compressed.has(key)) {
      const input = `${temp}/${key}.png`, target = `${temp}/${key}.ktx2`;
      try { compressed.set(key, await readFile(target)); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await writeFile(input, texture.getImage());
        const result = spawnSync('C:/Program Files/KTX-Software/bin/toktx.exe', [
          '--t2', '--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '1.5', '--zcmp', '18', '--genmipmap', '--assign_oetf', color, target, input,
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
    const file = `hr-setpiece-${hash.slice(0, 16)}.ktx2`; image.uri = file;
    if (!files.has(file)) { await writeFile(`${output}/${file}`, bytes); files.set(file, { kind: 'shared', bytes: bytes.length }); }
    sharedTextures.push({ path: `/world/lib/${file}`, bytes: bytes.length, sha256: hash });
  }
  const binary = encoded.resources[encoded.json.buffers[0].uri]; delete encoded.json.buffers[0].uri;
  const target = `${output}/${entry.file}`; await writeFile(target, glb(encoded.json, binary));
  const metrics = statistics(document);
  files.set(entry.file, { kind: 'model', bytes: (await stat(target)).size, materials: metrics.materials });
  const size = (await stat(target)).size, digest = sha(await readFile(target));
  assets.push({
    id: entry.id.replace('hr-prop-', 'hr-'), category: 'setpiece', license: 'CC0-1.0', source: proof,
    derivation: 'Original Blender geometry (tools/assets/blender/hr-fix-setpiece.py) with Poly Haven CC0 scans graded by hr-fix-setpiece-prepare.mjs; postcard prints are crops of the project\'s own world captures; no third-party models, logos or AI pixels.',
    delivery: 'deferred-after-play', integration: 'zones/setpiece-hr.ts; hardware Balanced/High only; Low keeps the procedural solids',
    textureMaxDimension: dimension, pieces: entry.pieces,
    // One authored level: near-field hero objects, hidden with their zone. Library tooling expects
    // a level-1 row for every asset, so it names the same file.
    lods: [0, 1].map(level => ({ level, file: entry.file, path: `/world/lib/${entry.file}`, bytes: size,
      sha256: digest, ...metrics,
      drawCalls: document.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().length, 0), sharedTextures,
      ...(level ? { note: 'same file as level 0' } : {}) })),
  });
  console.log(entry.id, `${metrics.triangles} tri`, `${(await stat(target)).size} B`, `${sharedTextures.length} textures`);
}
manifest.assets = manifest.assets.filter(a => !/^hr-setpiece-/.test(a.id));
manifest.assets.push(...assets);
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
for (const file of await readdir(output)) if (/^hr-setpiece-[a-f0-9]{16}\.ktx2$/.test(file) && !files.has(file)) await unlink(`${output}/${file}`);
const licenses = (await readFile('assets/LICENSES.csv', 'utf8')).trimEnd().split('\n')
  .filter(row => !row.startsWith(`${output}/hr-setpiece-`) && !row.startsWith(`${output}/hr-prop-setpiece-`));
for (const [file, info] of files) licenses.push(`${output}/${file},The Quiet Atlas original Blender geometry and procedural maps / Poly Haven CC0 scans (Rob Tuytel; Jenelle van Heerden; Dimitrios Savva; Rico Cilliers; Amal Kumar),CC0-1.0,yes,yes,yes,none,${proof.join('; ')}; tools/assets/blender/hr-fix-setpiece.py,${info.kind === 'shared' ? '<=1024 KTX2 UASTC' : 'external KTX2'},${info.materials ?? '-'},${info.kind === 'shared' ? 'shared' : 'LOD0'},existing zone colliders`);
await writeFile('assets/LICENSES.csv', licenses.join('\n') + '\n');
const total = [...files.values()].reduce((s, f) => s + f.bytes, 0);
await writeFile(`${temp}/packaged.json`, JSON.stringify({ assets, files: Object.fromEntries(files), addedBytes: total }, null, 2));
console.log(`HR-FIX-SETPIECE packaged ${assets.length} models / ${files.size} public files / ${total} bytes`);
