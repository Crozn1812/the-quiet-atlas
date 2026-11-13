// Run after character_c.py through the assigned Blender MCP; no downloads.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO, statistics } from '../shared.mjs';

const output = 'public/world/character';
await mkdir(output, { recursive: true });
const io = await createIO();
const document = await io.read('tmp/gfx-p5/character-duy-c.glb');
// Runtime supplies the atlas; prune's default removes unused TEXCOORD attributes.
await document.transform(dedup(), prune({ keepAttributes: true }), weld(), meshopt({ encoder: MeshoptEncoder }));
await io.write(`${output}/character-duy-c.glb`, document);
console.log({ ...statistics(document), bytes: (await stat(`${output}/character-duy-c.glb`)).size });
// P5 return2: one shared atlas, High 1K / Balanced 512. Low fetches nothing.
for (const size of [1024, 512]) {
  for (const kind of ['normal', 'orm']) {
    const result = spawnSync('C:/Program Files/KTX-Software/bin/toktx.exe', [
      '--t2', '--encode', kind === 'normal' ? 'uastc' : 'etc1s',
      ...(kind === 'normal' ? ['--uastc_quality', '2', '--zcmp', '18'] : ['--qlevel', '160']),
      '--genmipmap', '--assign_oetf', 'linear',
      `${output}/${kind}-${size}.ktx2`, `tmp/gfx-p5/${kind}-${size}.png`,
    ], { encoding: 'utf8', windowsHide: true });
    if (result.error || result.status) throw new Error(result.error?.message ?? result.stderr);
  }
}
const licensePath = 'assets/LICENSES.csv';
let licenses = await readFile(licensePath, 'utf8');
for (const kind of ['normal', 'orm']) {
  await rm(`${output}/${kind}-2048.ktx2`, { force: true });
  licenses = licenses.split('\n').filter(line => !line.startsWith(`${output}/${kind}-2048.ktx2,`)).join('\n');
}
const files = ['character-duy-c.glb', ...[1024, 512].flatMap(size => [`normal-${size}.ktx2`, `orm-${size}.ktx2`])];
for (const file of files) {
  const pathname = `${output}/${file}`;
  if (licenses.includes(`${pathname},`)) continue;
  const size = /-(\d+)\.ktx2$/.exec(file)?.[1] ?? '-';
  licenses += `${pathname},The Quiet Atlas (project-original Blender bake),Project-owned,yes,yes,yes,none,tools/assets/blender/character_c.py; GFX-P5 isolated Blender bake; no third-party pixels,${size},1,${file.endsWith('.glb') ? 'closeup' : '-'},-\n`;
}
await writeFile(licensePath, licenses);
