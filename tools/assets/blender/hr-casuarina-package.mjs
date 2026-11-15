// Offline meshopt + shared 2K KTX2 packaging; original authoring is CC0.
import { readFile, writeFile, appendFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dedup, prune, weld, meshopt, getTextureColorSpace } from '@gltf-transform/functions';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO, statistics } from '../shared.mjs';

export const evidence = 'tools/assets/blender/hr-casuarina-review';
export const temporary = 'tools/assets/blender/hr-casuarina-review/test-results/raw';
export const output = 'public/world/lib';
export const hash = b => createHash('sha256').update(b).digest('hex');
export async function license(file, lod, materials = 2) {
  const csv = await readFile('assets/LICENSES.csv', 'utf8');
  if (!csv.includes(`${file},`)) await appendFile('assets/LICENSES.csv', `${file},Poly Haven / The Quiet Atlas original Casuarina authoring,CC0-1.0,yes,yes,yes,none,https://polyhaven.com/a/pine_bark; https://polyhaven.com/license; https://creativecommons.org/publicdomain/zero/1.0/; tools/assets/blender/hr-casuarina.py,2048 KTX2 UASTC,${materials},${lod},none\n`);
}
export async function encode(input, target, color = 'srgb') {
  const result = spawnSync('C:/Program Files/KTX-Software/bin/toktx.exe', [
    '--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18',
    '--genmipmap', '--assign_oetf', color, target, input,
  ], { windowsHide: true, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  return readFile(target);
}
async function packageAssets() {
  await mkdir(evidence, { recursive: true });
  const io = await createIO(), textureCache = new Map();
  const inventory = JSON.parse(await readFile(`${temporary}/inventory.json`, 'utf8'));
  for (const entry of inventory) for (const lod of entry.lods) {
    const doc = await io.read(`${temporary}/${lod.file}`);
    for (const m of doc.getRoot().listMaterials()) if (m.getName().includes('cutout')) m.setAlphaMode('MASK').setAlphaCutoff(.30).setDoubleSided(true);
    await doc.transform(dedup(), prune(), weld());
    for (const texture of doc.getRoot().listTextures()) {
      const bytes = texture.getImage(), color = getTextureColorSpace(texture) ?? 'linear', key = hash(Buffer.concat([Buffer.from(bytes), Buffer.from(color)]));
      if (!textureCache.has(key)) {
        const input = `${temporary}/${key}.png`, target = `${temporary}/${key}.ktx2`;
        await writeFile(input, bytes); textureCache.set(key, await encode(input, target, color));
      }
      texture.setImage(textureCache.get(key)).setMimeType('image/ktx2').setURI('');
    }
    doc.createExtension(KHRTextureBasisu).setRequired(true);
    await doc.transform(dedup(), meshopt({ encoder: MeshoptEncoder }));
    const json = await io.writeJSON(doc, { format: 'GLTF' }), sharedTextures = [];
    for (const image of json.json.images ?? []) {
      const bytes = json.resources[image.uri], sha256 = hash(bytes);
      const file = `hr-tree-casuarina-shared-${sha256.slice(0, 16)}.ktx2`;
      image.uri = file; await writeFile(`${output}/${file}`, bytes); await license(`${output}/${file}`, 'shared', '-');
      sharedTextures.push({ path: `/world/lib/${file}`, bytes: bytes.length, sha256 });
    }
    const binary = json.resources[json.json.buffers[0].uri]; delete json.json.buffers[0].uri;
    const rawJson = Buffer.from(JSON.stringify(json.json)), jsonBytes = Buffer.alloc(Math.ceil(rawJson.length / 4) * 4, 32); rawJson.copy(jsonBytes);
    const bin = Buffer.alloc(Math.ceil(binary.length / 4) * 4); Buffer.from(binary).copy(bin);
    const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + jsonBytes.length + bin.length, 8); head.writeUInt32LE(jsonBytes.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
    const binHead = Buffer.alloc(8); binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
    const bytes = Buffer.concat([head, jsonBytes, binHead, bin]);
    await writeFile(`${output}/${lod.file}`, bytes); await license(`${output}/${lod.file}`, `LOD${lod.level}`);
    Object.assign(lod, statistics(doc), { path: `/world/lib/${lod.file}`, bytes: bytes.length, sha256: hash(bytes), drawCalls: doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().length, 0), sharedTextures });
    console.log(entry.id, lod.level, lod.triangles, lod.bytes);
  }
  const manifest = JSON.parse(await readFile(`${output}/manifest.json`, 'utf8'));
  for (const entry of inventory) {
    const index = manifest.assets.findIndex(a => a.id === entry.id);
    if (index < 0) manifest.assets.push(entry); else manifest.assets[index] = entry;
  }
  await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  // Remove only this generator's unreferenced shared images on a rebuild.
  const shared = new Set(inventory.flatMap(e => e.lods.flatMap(l => l.sharedTextures.map(t => t.path.split('/').at(-1)))));
  const obsolete = (await readdir(output)).filter(f => f.startsWith('hr-tree-casuarina-shared-') && f.endsWith('.ktx2') && !shared.has(f));
  for (const file of obsolete) await unlink(`${output}/${file}`);
  if (obsolete.length) {
    const csv = await readFile('assets/LICENSES.csv', 'utf8');
    await writeFile('assets/LICENSES.csv', csv.split('\n').filter(row => !obsolete.some(file => row.startsWith(`${output}/${file},`))).join('\n'));
  }
  await writeFile(`${evidence}/inventory.json`, JSON.stringify(inventory, null, 2) + '\n');
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/hr-casuarina-package.mjs')) await packageAssets();
