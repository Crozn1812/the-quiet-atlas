// Offline meshopt + shared KTX2; append only this ticket's manifest/license rows.
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dedup, prune, weld, meshopt, getTextureColorSpace } from '@gltf-transform/functions';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO, statistics } from '../shared.mjs';
const temp = 'tmp/hr-fix-wood/assets', output = 'public/world/lib';
const ids = JSON.parse(await readFile(`${temp}/inventory.json`, 'utf8'));
const manifest = JSON.parse(await readFile(`${output}/manifest.json`, 'utf8'));
const io = await createIO(), compressed = new Map(), files = new Map(), inventory = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function glb(json, binary) {
  const raw = Buffer.from(JSON.stringify(json)), j = Buffer.alloc(Math.ceil(raw.length/4)*4, 0x20); raw.copy(j);
  const b = Buffer.alloc(Math.ceil(binary.length/4)*4); Buffer.from(binary).copy(b);
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+j.length+b.length,8);
  head.writeUInt32LE(j.length,12);head.writeUInt32LE(0x4e4f534a,16);
  const bin = Buffer.alloc(8);bin.writeUInt32LE(b.length);bin.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([head,j,bin,b]);
}
for (const id of ids) {
  const entry = { id, category: 'prop', license: 'CC0-1.0', source: ['https://creativecommons.org/publicdomain/zero/1.0/'],
    derivation: 'Original Blender geometry and authored 2K PBR surfaces; tools/assets/blender/hr-fix-wood.py; no third-party assets or AI pixels; CC0 dedication by project authors.',
    delivery: 'deferred-after-play', textureMaxDimension: 2048, lods: [] };
  for (const level of [0,1]) {
    const file = `${id}-lod${level}.glb`, doc = await io.read(`${temp}/${file}`);
    await doc.transform(dedup(),prune(),weld());
    for (const texture of doc.getRoot().listTextures()) {
      const color = getTextureColorSpace(texture) ?? 'linear', hash = sha(Buffer.concat([Buffer.from(texture.getImage()),Buffer.from(color)]));
      if (!compressed.has(hash)) {
        const input = `${temp}/${hash}.png`, target = `${temp}/${hash}.ktx2`;
        await writeFile(input,texture.getImage());
        const result = spawnSync('C:/Program Files/KTX-Software/bin/toktx.exe',[
          '--t2','--encode','uastc','--uastc_quality','2','--zcmp','18','--genmipmap','--assign_oetf',color,target,input,
        ],{ windowsHide:true,encoding:'utf8' });
        if (result.error || result.status) throw new Error(result.error?.message ?? result.stderr);
        compressed.set(hash,await readFile(target));
      }
      texture.setImage(compressed.get(hash)).setMimeType('image/ktx2').setURI('');
    }
    if (doc.getRoot().listTextures().length) doc.createExtension(KHRTextureBasisu).setRequired(true);
    await doc.transform(dedup(),meshopt({encoder:MeshoptEncoder}));
    const encoded = await io.writeJSON(doc,{format:'GLTF'}), sharedTextures = [];
    for (const im of encoded.json.images ?? []) {
      const bytes=encoded.resources[im.uri], hash=sha(bytes), name=`hr-wood-${hash.slice(0,16)}.ktx2`;
      im.uri=name;await writeFile(`${output}/${name}`,bytes);files.set(name,{bytes:bytes.length,sha256:hash});
      sharedTextures.push({path:`/world/lib/${name}`,bytes:bytes.length,sha256:hash});
    }
    const binary=encoded.resources[encoded.json.buffers[0].uri];delete encoded.json.buffers[0].uri;
    const bytes=glb(encoded.json,binary);await writeFile(`${output}/${file}`,bytes);
    const lod={level,file,path:`/world/lib/${file}`,bytes:bytes.length,sha256:sha(bytes),...statistics(doc),
      drawCalls:doc.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().length,0),sharedTextures};
    entry.lods.push(lod);files.set(file,lod);
  }
  inventory.push(entry);
}
manifest.assets = manifest.assets.filter(a=>!ids.includes(a.id));manifest.assets.push(...inventory);
await writeFile(`${output}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
const rows=(await readFile('assets/LICENSES.csv','utf8')).trimEnd().split('\n').filter(row=>!row.startsWith(`${output}/hr-wood-`) && ![...files.keys()].some(file=>row.startsWith(`${output}/${file},`)));
for(const name of await readdir(output))if(/^hr-wood-[a-f0-9]{16}\.ktx2$/.test(name)&&!files.has(name))await unlink(`${output}/${name}`);
for(const [file] of files) rows.push(`${output}/${file},The Quiet Atlas original Blender geometry and authored PBR - CC0 dedication,CC0-1.0,yes,yes,yes,none,https://creativecommons.org/publicdomain/zero/1.0/ ; tools/assets/blender/hr-fix-wood.py - reproducible source no downloads,2048 KTX2 UASTC,-,High,existing gameplay colliders unchanged`);
await writeFile('assets/LICENSES.csv',rows.join('\n')+'\n');
const report={inventory,addedBytes:[...files.values()].reduce((s,f)=>s+f.bytes,0),files:[...files.keys()]};
await writeFile(`${temp}/packaged.json`,JSON.stringify(report,null,2)+'\n');
console.log(`HR-FIX-WOOD ${inventory.length} assets / ${files.size} files / ${report.addedBytes} bytes`);
