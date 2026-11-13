// GFX-01. Original procedural imagery dedicated to CC0-1.0; no external pixels.
// Rebuild: node tools/assets/textures/generate-aaa.mjs (local KTX-Software required).
import { mkdir, writeFile, readFile, appendFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = resolve(root, 'public/world/lib/gfx01');
const temp = resolve(root, 'tmp/gfx01-textures');
await mkdir(output, { recursive: true });
await mkdir(temp, { recursive: true });
const encoder = process.env.TOKTX ?? 'C:/Program Files/KTX-Software/bin/toktx.exe';
const clamp = x => Math.max(0, Math.min(255, Math.round(x)));
function hash(x, y, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ s;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(u, v, cells, seed) {
  const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
  const f = n => n * n * (3 - 2 * n), a = f(x - ix), b = f(y - iy);
  const at = (dx, dy) => hash((ix + dx + cells) % cells, (iy + dy + cells) % cells, seed);
  return (at(0, 0) * (1 - a) + at(1, 0) * a) * (1 - b) + (at(0, 1) * (1 - a) + at(1, 1) * a) * b;
}
function height(kind, u, v) {
  const n = (c, s) => noise(u, v, c, s);
  if (kind === 'bark') return 0.4 * n(32, 13) + 0.4 * Math.sin(u * Math.PI * 48 + n(8, 7) * 4) + 0.2 * n(128, 31);
  if (kind === 'rock') return 0.55 * n(12, 71) + 0.3 * Math.sin((u + v) * Math.PI * 20 + n(8, 17) * 4) + 0.15 * n(128, 43);
  return 0.55 * n(16, 23) + 0.3 * n(64, 97) + 0.15 * n(256, 53);
}
function crc(data) {
  let c = 0xffffffff;
  for (const byte of data) { c ^= byte; for (let b = 0; b < 8; b++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function png(width, height, rgba) {
  const chunk = (name, bytes) => {
    const tag = Buffer.from(name), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc(Buffer.concat([tag, bytes])));
    return Buffer.concat([size, tag, bytes, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const inventory = [];
for (const size of [1024, 2048]) for (const kind of ['ground', 'rock', 'bark', 'leaves']) {
  for (const normal of kind === 'leaves' ? [false] : [false, true]) {
    const rgba = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = (y * size + x) * 4;
      if (kind === 'leaves') {
        // A compound spray of narrow leaves; empty pixels are actually transparent.
        const px = (u - 0.5) * 2, py = (v - 0.5) * 2;
        let coverage = 0;
        for (let j = 0; j < 7; j++) for (const side of [-1, 1]) {
          const cy = -0.72 + j * 0.22, cx = side * (0.11 + 0.07 * Math.sin(j));
          const lx = (px - cx) * 0.78 + (py - cy) * side * 0.63;
          const ly = -(px - cx) * side * 0.63 + (py - cy) * 0.78;
          coverage = Math.max(coverage, 1 - (lx / 0.14) ** 2 - (ly / 0.32) ** 2);
        }
        const vein = 0.88 + 0.12 * Math.sin(v * 120 + u * 45);
        rgba.set([clamp(212 * vein), clamp(234 * vein), clamp(205 * vein), clamp(coverage * 1800)], i);
      } else if (normal) {
        const d = 1 / size, dx = (height(kind, u + d, v) - height(kind, u - d, v)) * 5;
        const dy = (height(kind, u, v + d) - height(kind, u, v - d)) * 5, len = Math.hypot(dx, dy, 1);
        rgba.set([clamp(127.5 - dx / len * 127.5), clamp(127.5 - dy / len * 127.5), clamp(127.5 + 127.5 / len), 255], i);
      } else {
        const value = clamp(204 + height(kind, u, v) * 48);
        rgba.set([value, value, value, 255], i);
      }
    }
    const name = `${kind}${normal ? '-normal' : ''}-${size}`;
    const input = resolve(temp, `${name}.png`), dest = resolve(output, `${name}.ktx2`);
    await writeFile(input, png(size, size, rgba));
    const flags = normal ? ['--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '9', '--normal_mode'] : ['--encode', 'etc1s', '--qlevel', '160'];
    const result = spawnSync(encoder, ['--t2', '--genmipmap', '--assign_oetf', normal ? 'linear' : 'srgb', ...flags, dest, input], { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
    inventory.push({ file: `${name}.ktx2`, bytes: (await stat(dest)).size, size, kind });
    console.info(`${name}: ${inventory.at(-1).bytes} bytes`);
  }
}
// Linear HDR sky, not an LDR renamed .hdr. Radiance RGBE with a warm sun >1.0.
const width = 512, h = 256, scanlines = [];
for (let y = 0; y < h; y++) {
  const channels = Array.from({ length: 4 }, () => Buffer.alloc(width));
  for (let x = 0; x < width; x++) {
    const elevation = Math.cos(y / (h - 1) * Math.PI), azimuth = x / width * Math.PI * 2;
    const horizon = Math.exp(-Math.abs(elevation) * 5), sun = Math.exp(-((azimuth - 4.1) ** 2 + (elevation - 0.17) ** 2) * 650) * 14;
    const rgb = elevation < 0 ? [0.085, 0.11, 0.065] : [0.16 + horizon * 0.46 + sun, 0.29 + horizon * 0.34 + sun * 0.78, 0.43 + horizon * 0.18 + sun * 0.46];
    const exponent = Math.ceil(Math.log2(Math.max(...rgb))), scale = 256 / 2 ** exponent;
    for (let c = 0; c < 3; c++) channels[c][x] = clamp(rgb[c] * scale);
    channels[3][x] = exponent + 128;
  }
  scanlines.push(Buffer.from([2, 2, width >> 8, width & 255]));
  for (const channel of channels) for (let x = 0; x < width; x += 128) scanlines.push(Buffer.from([128]), channel.subarray(x, x + 128));
}
await writeFile(resolve(output, 'sky.hdr'), Buffer.concat([Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${width}\n`), ...scanlines]));
inventory.push({ file: 'sky.hdr', bytes: (await stat(resolve(output, 'sky.hdr'))).size, size: '512x256', kind: 'environment' });
await mkdir(resolve(root, 'tools/styleframes/aaa'), { recursive: true });
await writeFile(resolve(root, 'tools/styleframes/aaa/asset-bytes.json'), JSON.stringify(inventory, null, 2) + '\n');
const csvPath = resolve(root, 'assets/LICENSES.csv'), existing = await readFile(csvPath, 'utf8');
for (const item of inventory) {
  const file = `public/world/lib/gfx01/${item.file}`;
  if (!existing.includes(file + ',')) await appendFile(csvPath, `${file},The Quiet Atlas (project-original),CC0-1.0,yes,yes,yes,none,Original procedural imagery dedicated to CC0-1.0; tools/assets/textures/generate-aaa.mjs; no third-party pixels,${item.size},1,-,none\n`);
}
console.info(`GFX-01 textures + HDR: ${inventory.reduce((sum, item) => sum + item.bytes, 0)} bytes`);
