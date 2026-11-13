// After prepare-cc0.py via Blender MCP: node tools/assets/textures/encode-cc0.mjs
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const output = resolve('public/world/tex');
await mkdir(output, { recursive: true });
const sources = JSON.parse(await readFile('tmp/gfx-p2/sources.json', 'utf8'));
const files = [];
for (const size of [512, 1024, 2048]) for (const kind of ['color', 'surface']) {
  const name = `${kind}-${size}.ktx2`;
  // Surface RGB stores OpenGL normal XY and photographic roughness. ETC1S
  // fits all three tiers under ADR0018's shared world budget (no extra alpha).
  const result = spawnSync(process.env.TOKTX ?? 'C:/Program Files/KTX-Software/bin/toktx.exe', [
    '--t2', '--genmipmap', '--assign_oetf', kind === 'color' ? 'srgb' : 'linear',
    '--encode', 'etc1s', '--qlevel', kind === 'color' ? '96' : '128',
    '--clevel', '2', resolve(output, name), resolve(`tmp/gfx-p2/${kind}-${size}.png`),
  ], { encoding: 'utf8' });
  if (result.error || result.status) throw result.error ?? new Error(result.stderr);
  files.push({ file: name, bytes: (await stat(resolve(output, name))).size, tileSize: size, kind,
    width: size * 4, height: size === 2048 ? 3072 : size * 2,
    surfaceSizes: size === 2048 ? [2048, 1024, 2048, 1024, 2048, 1024, 1024, 2048] : Array(8).fill(size) });
  console.info(`${name}: ${files.at(-1).bytes} bytes`);
}
await writeFile('tools/assets/textures/cc0-sources.json', JSON.stringify({ sources, files }, null, 2) + '\n');
const licensePath = 'assets/LICENSES.csv';
const existing = (await readFile(licensePath, 'utf8')).split(/\r?\n/).filter(line => !line.startsWith('public/world/tex/'));
while (existing.at(-1) === '') existing.pop();
for (const file of files) existing.push([
  `public/world/tex/${file.file}`, 'Poly Haven (eight photographic sets; tools/assets/textures/cc0-sources.json)',
  'CC0-1.0', 'yes', 'yes', 'yes', 'none',
  'https://polyhaven.com/license; source URLs and SHA-256 in tools/assets/textures/cc0-sources.json',
  `${file.width}x${file.height} (${file.tileSize === 2048 ? 'mixed 2K and 1K' : `${file.tileSize} per surface`})`, '8', '-', '-',
].join(','));
await writeFile(licensePath, existing.join('\n') + '\n');
console.info(`GFX-P2 added ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes`);
