import { mkdir, writeFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const SIZE = 512;
const wrap = (v, n) => ((v % n) + n) % n;
function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, cells, seed) {
  const px = x / SIZE * cells, py = y / SIZE * cells;
  const ix = Math.floor(px), iy = Math.floor(py);
  const smooth = t => t * t * (3 - 2 * t);
  const fx = smooth(px - ix), fy = smooth(py - iy);
  const at = (dx, dy) => hash(wrap(ix + dx, cells), wrap(iy + dy, cells), seed);
  return (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy)
    + (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy;
}
// Periodic fields without duplicated edge texels; linear luminance data.
export function field(kind, x, y) {
  const n = (cells, seed) => noise(x, y, cells, seed) * 2 - 1;
  switch (kind) {
    case 'grass': return 0.6 * n(12, 71) + 0.25 * n(42, 89) + 0.15 * n(5, 31);
    case 'dirt': return 0.5 * n(28, 53) + 0.3 * n(9, 43) + 0.2 * n(96, 19);
    case 'rock': return 0.55 * n(12, 97) + 0.25 * n(35, 101) + 0.2 * Math.sin((x + y) / SIZE * Math.PI * 18 + n(8, 79) * 3);
    case 'sand': return 0.4 * n(180, 29) + 0.25 * n(36, 13) + 0.35 * Math.sin(y / SIZE * Math.PI * 36 + n(6, 17) * 2);
    default: throw new Error(`Unknown texture: ${kind}`);
  }
}
export function pixels(kind) {
  const data = Buffer.alloc(SIZE * SIZE * 3);
  const values = Float64Array.from({ length: SIZE * SIZE }, (_, i) => field(kind, i % SIZE, Math.floor(i / SIZE)));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  for (let i = 0; i < values.length; i++) data.fill(Math.round(127.5 + 65 * (values[i] - mean)), i * 3, i * 3 + 3);
  return data;
}
export async function generate() {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const temp = resolve(root, 'tmp/ground-textures'), output = resolve(root, 'public/world/textures');
  await mkdir(temp, { recursive: true });
  await mkdir(output, { recursive: true });
  const encoder = process.env.TOKTX ?? (process.platform === 'win32' ? 'C:/Program Files/KTX-Software/bin/toktx.exe' : 'toktx');
  let bytes = 0;
  for (const kind of ['grass', 'dirt', 'rock', 'sand', 'normal']) {
    let data;
    if (kind === 'normal') {
      data = Buffer.alloc(SIZE * SIZE * 3);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const dx = (noise(x + 1, y, 32, 61) - noise(x - 1, y, 32, 61)) * 0.6;
        const dy = (noise(x, y + 1, 32, 61) - noise(x, y - 1, 32, 61)) * 0.6;
        const length = Math.hypot(dx, dy, 1);
        data.set([Math.round(127.5 - dx / length * 127.5), Math.round(127.5 - dy / length * 127.5), Math.round(127.5 + 127.5 / length)], (y * SIZE + x) * 3);
      }
    } else data = pixels(kind);
    const inputs = [], dest = resolve(output, `${kind}.ktx2`);
    // Explicit box-filtered periodic mip chain. No clamp-to-edge filtering seams.
    for (let size = SIZE; size >= 1; size /= 2) {
      const input = resolve(temp, `${kind}-${size}.ppm`);
      inputs.push(input);
      await writeFile(input, Buffer.concat([Buffer.from(`P6\n${size} ${size}\n255\n`), data]));
      if (size === 1) break;
      const next = Buffer.alloc(size * size * 3 / 4);
      for (let y = 0; y < size / 2; y++) for (let x = 0; x < size / 2; x++) {
        for (let c = 0; c < 3; c++) {
          const at = (dx, dy) => data[((y * 2 + dy) * size + x * 2 + dx) * 3 + c];
          next[(y * size / 2 + x) * 3 + c] = Math.round((at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4);
        }
      }
      data = next;
    }
    const flags = kind === 'normal' ? ['--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '9', '--normal_mode'] : ['--encode', 'etc1s', '--qlevel', '160'];
    const result = spawnSync(encoder, ['--t2', '--mipmap', '--assign_oetf', 'linear', '--assign_primaries', 'none', ...flags, dest, ...inputs], { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
    const size = (await stat(dest)).size;
    bytes += size;
    console.info(`${kind}.ktx2: ${size} bytes`);
  }
  if (bytes > 600_000) throw new Error(`Ground textures exceed 600 KB: ${bytes}`);
  console.info(`Ground textures: ${bytes}/600000 bytes; include decoder/runtime in the 8000000-byte entry budget.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await generate();
