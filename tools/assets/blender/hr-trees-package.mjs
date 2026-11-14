// Offline HR-TREE1 packager. No new dependencies, network, or runtime edits.
import { readFile, writeFile, mkdir, stat, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dedup, prune, weld, meshopt, getTextureColorSpace } from '@gltf-transform/functions';
import { KHRTextureBasisu, KHRMaterialsDiffuseTransmission } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO, statistics } from '../shared.mjs';

const output = 'public/world/lib';
const bambooOnly = process.argv.includes('--bamboo');
const temporary = 'tmp/hr-trees';
const evidence = bambooOnly ? 'tools/assets/blender/hr-trees-bamboo-review' : 'tools/assets/blender/hr-trees-review';
await mkdir(evidence, { recursive: true });
const io = await createIO();
const inventory = JSON.parse(await readFile(`${temporary}/${bambooOnly ? 'bamboo-inventory' : 'inventory'}.json`, 'utf8'));
const textureCache = new Map();
const licenses = await readFile('assets/LICENSES.csv', 'utf8');
const additions = [];
const sharedTextures = new Map();
const manifestText = await readFile(`${output}/manifest.json`, 'utf8');
const manifest = JSON.parse(manifestText);

async function compress(document) {
  for (const texture of document.getRoot().listTextures()) {
    const bytes = texture.getImage();
    if (!bytes || texture.getMimeType() === 'image/ktx2') continue;
    const color = getTextureColorSpace(texture) ?? 'linear';
    const key = createHash('sha256').update(bytes).update(color).digest('hex');
    if (!textureCache.has(key)) {
      const input = `${temporary}/${key}.png`;
      const target = `${temporary}/${key}.ktx2`;
      await writeFile(input, bytes);
      const result = spawnSync('C:/Program Files/KTX-Software/bin/toktx.exe', [
        '--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18',
        '--genmipmap', '--assign_oetf', color, target, input,
      ], { windowsHide: true, encoding: 'utf8' });
      if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
      textureCache.set(key, await readFile(target));
    }
    texture.setImage(textureCache.get(key)).setMimeType('image/ktx2').setURI('');
  }
  document.createExtension(KHRTextureBasisu).setRequired(true);
}

for (const entry of inventory) {
  for (const lod of entry.lods) {
    const document = await io.read(`${temporary}/${lod.file}`);
    for (const material of document.getRoot().listMaterials()) {
      if (!bambooOnly && entry.architecture === 'bamboo' && material.getName().includes('bark')) {
        material.setBaseColorFactor([.38,.69,.18,1]).setNormalScale(.18).setRoughnessFactor(.68);
      }
      if (material.getName().includes('leaf-cutout')) {
        material.setAlphaMode('MASK').setAlphaCutoff(.45).setDoubleSided(true);
        const ext = document.createExtension(KHRMaterialsDiffuseTransmission);
        material.setExtension('KHR_materials_diffuse_transmission', ext.createDiffuseTransmission()
          .setDiffuseTransmissionFactor(.32).setDiffuseTransmissionColorFactor([.65, .85, .38]));
      }
      if (material.getName().includes('moss')) material.setBaseColorFactor([.19,.37,.085,1]);
    }
    // Keep individual folded sprigs intact while filling tropical crowns.
    // Blender exports six unique vertices per sprig; expand around that sprig,
    // never around the origin (which would detach leaves from their branches).
    for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
      if (entry.architecture === 'bamboo' || !primitive.getMaterial()?.getName().includes('leaf-cutout')) continue;
      const positions = primitive.getAttribute('POSITION');
      if (positions.getCount() % 6) throw new Error('Unexpected folded-sprig topology');
      for (let first = 0; first < positions.getCount(); first += 6) {
        const center = [0,0,0];
        for (let i=0;i<6;i++) positions.getElement(first+i,[]).forEach((v,j)=>{center[j]+=v/6;});
        for (let i=0;i<6;i++) positions.setElement(first+i,positions.getElement(first+i,[]).map((v,j)=>center[j]+(v-center[j])*1.75));
      }
    }
    await document.transform(dedup(), prune(), weld());
    await compress(document);
    await document.transform(dedup(), meshopt({ encoder: MeshoptEncoder }));
    const target = `${output}/${lod.file}`;
    // Bamboo keeps its two KTX2 maps embedded: all new public files stay under
    // the ticket's hr-tree-bamboo-* scope; no changes to shared tree textures.
    if (bambooOnly) await io.write(target, document);
    // GLB allows external images. Keep geometry embedded, but share identical
    // 2K photographic maps across all 24 LODs and browser/GPU caches.
    const jsonDoc = await io.writeJSON(document, { format: 'GLTF' });
    const textures = [];
    for (const image of bambooOnly ? [] : jsonDoc.json.images ?? []) {
      const bytes = jsonDoc.resources[image.uri];
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const file = `hr-shared-${sha256.slice(0,16)}.ktx2`;
      image.uri = file;
      const texture = { path: `/world/lib/${file}`, bytes: bytes.length, sha256 };
      textures.push(texture);
      if (!sharedTextures.has(file)) {
        sharedTextures.set(file, texture);
        await writeFile(`${output}/${file}`, bytes);
        if (!licenses.includes(`${output}/${file},`)) additions.push(`${output}/${file},Poly Haven / The Quiet Atlas leaf cutout derivative,CC0-1.0,yes,yes,yes,none,https://polyhaven.com/a/pine_bark; https://polyhaven.com/a/forest_floor; https://polyhaven.com/license; tools/assets/blender/hr-trees.py,2048 KTX2 UASTC,-,shared,none`);
      }
    }
    const binary = jsonDoc.resources[jsonDoc.json.buffers[0].uri];
    delete jsonDoc.json.buffers[0].uri;
    const jsonBytes = Buffer.from(JSON.stringify(jsonDoc.json));
    const jsonPadded = Buffer.alloc(Math.ceil(jsonBytes.length/4)*4,0x20);jsonBytes.copy(jsonPadded);
    const binPadded = Buffer.alloc(Math.ceil(binary.length/4)*4);Buffer.from(binary).copy(binPadded);
    const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);
    header.writeUInt32LE(28+jsonPadded.length+binPadded.length,8);header.writeUInt32LE(jsonPadded.length,12);header.writeUInt32LE(0x4e4f534a,16);
    const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binPadded.length,0);binHeader.writeUInt32LE(0x004e4942,4);
    if (!bambooOnly) await writeFile(target,Buffer.concat([header,jsonPadded,binHeader,binPadded]));
    const root = document.getRoot();
    const drawCalls = root.listMeshes().reduce((sum,m) => sum+m.listPrimitives().length,0);
    const textureDimensions = root.listTextures().map(t => {
      const b=t.getImage(); const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
      return [view.getUint32(20,true),view.getUint32(24,true)];
    });
    Object.assign(lod, statistics(document), { drawCalls, textureDimensions, sharedTextures: textures,
      path: `/world/lib/${lod.file}`, bytes: (await stat(target)).size,
      sha256: createHash('sha256').update(await readFile(target)).digest('hex') });
    if (!licenses.includes(`${target},`)) additions.push(`${target},Poly Haven / The Quiet Atlas original geometry,CC0-1.0,yes,yes,yes,none,${entry.source.join('; ')}; https://polyhaven.com/license; tools/assets/blender/${bambooOnly ? 'hr-trees-bamboo.py' : 'hr-trees.py'},2048 KTX2 UASTC,${lod.materials},LOD${lod.level},none`);
  }
  Object.assign(entry, { delivery: 'deferred-after-play', textureMaxDimension: 2048,
    branchLevels: entry.architecture === 'bamboo' ? 3 : 4,
    low: 'impostor or existing procedural fallback; never preload LOD0',
    // Assets have their natural metre scale; fallen assets deliberately remain horizontal.
    integration: 'Keep distinct PBR primitives. Existing flattenLibraryTree is incompatible.' });
  if (entry.architecture !== 'bamboo') entry.derivation += '; intact folded sprigs expanded 1.75x around their own centers';
  console.info(entry.id, entry.lods.map(l=>`${l.triangles}tri/${l.bytes}B/${l.drawCalls}draw`).join(' | '));
}

// Append only; never replace or reorder an approved manifest entry/metadata.
// Rebuild this ticket's entries only; preserve every other entry byte-for-byte
// at the object level and in its original order.
for (const entry of inventory) {
  const index = manifest.assets.findIndex(a => a.id === entry.id);
  if (index < 0) manifest.assets.push(entry);
  else manifest.assets[index] = entry;
}
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest,null,2)+'\n');
if (additions.length) await appendFile('assets/LICENSES.csv',(licenses.endsWith('\n')?'':'\n')+additions.join('\n')+'\n');
if (bambooOnly) {
  const csv = await readFile('assets/LICENSES.csv', 'utf8');
  const rows = csv.split('\n').map(row => {
    if (!row.startsWith(`${output}/hr-tree-bamboo-`)) return row;
    const fields = row.split(',');
    fields[1] = 'Poly Haven photographs / The Quiet Atlas authored bamboo derivative';
    fields[7] = 'https://polyhaven.com/a/pine_bark; https://polyhaven.com/a/forest_floor; https://polyhaven.com/license; tools/assets/blender/hr-trees-bamboo.py';
    const lod = inventory.flatMap(e => e.lods).find(l => fields[0] === `${output}/${l.file}`);
    if (lod) fields[9] = String(lod.materials);
    return fields.join(',');
  });
  await writeFile('assets/LICENSES.csv', rows.join('\n'));
}
await writeFile(`${evidence}/inventory.json`,JSON.stringify(inventory,null,2)+'\n');
console.info('LOD GLB bytes:',inventory.flatMap(e=>e.lods).reduce((s,l)=>s+l.bytes,0));
console.info('Shared KTX2 bytes:',[...sharedTextures.values()].reduce((s,t)=>s+t.bytes,0));
