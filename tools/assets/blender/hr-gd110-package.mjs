// Offline, deterministic Blender -> shared 1K KTX2 + meshopt GLB. No downloads.
import { mkdir, readFile, writeFile, stat, appendFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dedup, prune, weld, meshopt, mergeDocuments, unpartition, getTextureColorSpace } from '@gltf-transform/functions';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO, statistics } from '../shared.mjs';

const output = 'public/world/vehicle';
const temporary = 'tmp/hr-gd110';
await mkdir(output, { recursive: true });
const io = await createIO();
const inventory = JSON.parse(await readFile(`${temporary}/inventory.json`, 'utf8'));
const document = await io.read(`${temporary}/${inventory[0].file}`);
for (const [lod, entry] of inventory.entries()) {
  const source = lod === 0 ? document : await io.read(`${temporary}/${entry.file}`);
  const scene = source.getRoot().listScenes()[0];
  scene.setName(`lod${lod}`);
  scene.listChildren()[0].setName(`lod${lod}`).setExtras({ lod });
  for (const node of source.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const name = node.getName();
    node.setExtras({ ...node.getExtras(), runtimeTarget: name.startsWith('front_wheel') ? 'front_wheel'
      : name.startsWith('rear_wheel') ? 'rear_wheel' : name.startsWith('steering') ? 'steering' : 'chassis' });
  }
  if (lod !== 0) mergeDocuments(document, source);
}
const scenes = document.getRoot().listScenes();
for (const scene of scenes.slice(1)) {
  for (const child of scene.listChildren()) scenes[0].addChild(child);
  scene.dispose();
}
document.getRoot().setDefaultScene(scenes[0]);
await document.transform(dedup(), prune(), weld(), unpartition());
const sizes = [];
for (const [index, texture] of document.getRoot().listTextures().entries()) {
  const input = `${temporary}/texture-${index}.png`, target = `${temporary}/texture-${index}.ktx2`;
  await writeFile(input, texture.getImage());
  const color = getTextureColorSpace(texture) ?? 'linear';
  const result = spawnSync('C:/Program Files/KTX-Software/bin/toktx.exe', [
    '--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18',
    '--genmipmap', '--assign_oetf', color, target, input,
  ], { windowsHide: true, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  const bytes = await readFile(target);
  sizes.push(bytes.length);
  texture.setImage(bytes).setMimeType('image/ktx2').setURI('');
}
document.createExtension(KHRTextureBasisu).setRequired(true);
await document.transform(meshopt({ encoder: MeshoptEncoder }));
const file = `${output}/vehicle-gd110.glb`;
await io.write(file, document);
const manifest = {
  id: 'hr-gd110', path: '/world/vehicle/vehicle-gd110.glb',
  delivery: 'deferred after playable frame; hardware Balanced/High only',
  encoding: ['EXT_meshopt_compression', 'KHR_texture_basisu', 'KHR_materials_clearcoat', 'KHR_materials_transmission'], textureDimensions: [1024, 1024],
  textureBytes: sizes, bytes: (await stat(file)).size,
  sha256: createHash('sha256').update(await readFile(file)).digest('hex'),
  ...statistics(document), lods: inventory.map(({ triangles, draws }, level) => ({ level, triangles, draws })),
  lodDistances: { far: 18, near: 15 }, scale: .81, wheelRadius: .243, wheelbase: 1.0368,
  steeringPivot: [0, .7371, .3483], riderSeat: [0, .8019, -.2025],
  collider: 'Existing simulation collider remains unchanged',
  fallback: 'vehicle/mesh.ts; Low and software rasterizers; no GLB request',
  sources: ['https://polyhaven.com/a/sand_01', 'https://polyhaven.com/license',
    'https://creativecommons.org/publicdomain/zero/1.0/'],
  authoring: 'tools/assets/blender/hr-gd110.py; original geometry and procedural maps dedicated to CC0',
};
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
const licenses = await readFile('assets/LICENSES.csv', 'utf8');
const additions = [file, `${output}/manifest.json`].filter(path => !licenses.includes(`${path},`)).map(path =>
  `${path},The Quiet Atlas original Blender geometry and bakes / Poly Haven sand_01,CC0-1.0,yes,yes,yes,none,https://polyhaven.com/a/sand_01; https://polyhaven.com/license; https://creativecommons.org/publicdomain/zero/1.0/; tools/assets/blender/hr-gd110.py,1024 KTX2 UASTC,1,LOD0+LOD1,existing vehicle collider`);
if (additions.length) await appendFile('assets/LICENSES.csv', (licenses.endsWith('\n') ? '' : '\n') + additions.join('\n') + '\n');
console.log(JSON.stringify(manifest, null, 2));
