// HR-FIX-SETPIECE step 1/3: derive the working PBR maps in tmp/ from CC0 Poly Haven scans.
// Usage: node tools/assets/blender/hr-fix-setpiece-prepare.mjs [--gallery <dir with the project's own audit captures>]
// Downloads are data only (JPEG), verified against the md5 published by the Poly Haven API,
// kept in tmp/ (gitignored) and never executed.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sharp } from '../../review/luma.mjs';

const work = 'tmp/hr-fix-setpiece', source = `${work}/ph`, out = `${work}/tex`;
const galleryFlag = process.argv.indexOf('--gallery');
const gallery = galleryFlag > 0 ? process.argv[galleryFlag + 1] : 'D:/tqa-worktrees/hr-audit-gallery';
await mkdir(source, { recursive: true }); await mkdir(out, { recursive: true });

export const SOURCES = ['rough_wood', 'fine_grained_wood', 'ash_veneer', 'sapele_veneer', 'rusty_metal_02', 'rust_coarse_01', 'dark_rock'];
const provenance = [];
for (const id of SOURCES) {
  const headers = { 'User-Agent': 'asset-pipeline/1.0' };
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers })).json();
  const info = await (await fetch(`https://api.polyhaven.com/info/${id}`, { headers })).json();
  const maps = {};
  for (const [key, short] of [['Diffuse', 'diff'], ['nor_gl', 'nor_gl'], ['arm', 'arm']]) {
    const entry = files[key]['1k'].jpg, file = `${source}/${id}-${short}-1k.jpg`;
    try { await access(file); } catch { await writeFile(file, Buffer.from(await (await fetch(entry.url)).arrayBuffer())); }
    const md5 = createHash('md5').update(await readFile(file)).digest('hex');
    if (md5 !== entry.md5) throw new Error(`${file}: md5 ${md5} differs from Poly Haven ${entry.md5}`);
    maps[short] = { file, url: entry.url, md5 };
  }
  provenance.push({ id, source: `https://polyhaven.com/a/${id}`, license: 'CC0-1.0', authors: info.authors, maps });
}
await writeFile(`${work}/sources.json`, JSON.stringify(provenance, null, 2) + '\n');

const raw = async (file, size) => sharp(file).resize(size, size).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const save = (name, data, size, channels = 3) => sharp(data, { raw: { width: size, height: size, channels } }).png().toFile(`${out}/${name}.png`);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
async function grade(id, map, name, size, pixel) {
  const { data } = await raw(`${source}/${id}-${map}-1k.jpg`, size);
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = pixel(data[i], data[i + 1], data[i + 2], i / 3);
    data[i] = Math.min(255, Math.max(0, r)); data[i + 1] = Math.min(255, Math.max(0, g)); data[i + 2] = Math.min(255, Math.max(0, b));
  }
  await save(name, data, size);
}
const keep = (r, g, b) => [r, g, b];

// Weathered grey timber: signposts, rack, lamp post, bench. Grain runs along V.
await grade('rough_wood', 'diff', 'wood-weathered-color', 1024, (r, g, b) => [r * 1.04 + 4, g * 1.0 + 2, b * .93]);
await grade('rough_wood', 'nor_gl', 'wood-weathered-normal', 1024, keep);
await grade('rough_wood', 'arm', 'wood-weathered-orm', 512, (r, g) => [255, g * 1.25 + 40, 0]);
// Dark, old lacquered case wood for the upright piano. The lacquer is a glTF clearcoat.
await grade('fine_grained_wood', 'diff', 'wood-dark-color', 1024, (r, g, b) => [r * .58, g * .5, b * .46]);
await grade('fine_grained_wood', 'nor_gl', 'wood-dark-normal', 512, (r, g, b) => [128 + (r - 128) * .45, 128 + (g - 128) * .45, b]);
await grade('ash_veneer', 'diff', 'veneer-light-color', 512, (r, g, b) => [r * 1.02, g * .9, b * .7]);
await grade('sapele_veneer', 'diff', 'veneer-red-color', 512, (r, g, b) => [r * .52, g * .44, b * .4]);
// Forged iron with heat scale and rust.
await grade('rust_coarse_01', 'diff', 'iron-rust-color', 512, (r, g, b) => { const l = (r + g + b) / 3; return [l * .3 + r * .22, l * .3 + g * .2, l * .3 + b * .2]; });
await grade('rust_coarse_01', 'nor_gl', 'iron-rust-normal', 512, keep);
await grade('rust_coarse_01', 'arm', 'iron-rust-orm', 512, (r, g) => [255, g * .82, 150]);
await grade('dark_rock', 'diff', 'rock-dark-color', 1024, (r, g, b) => [r * 1.75 + 8, g * 1.68 + 8, b * 1.6 + 8]);
await grade('dark_rock', 'nor_gl', 'rock-dark-normal', 1024, keep);

// Old enamel paint over steel: keep only the dense rust blooms of the scan and their stains.
{
  const size = 1024, { data } = await raw(`${source}/rusty_metal_02-diff-1k.jpg`, size);
  const orm = Buffer.alloc(size * size * 3), saturation = Buffer.alloc(size * size);
  for (let i = 0; i < data.length; i += 3) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
    saturation[i / 3] = max ? 255 * (max - min) / max : 0;
  }
  // Rust survives only where the scan has dense blooms; isolated freckles become faint stains.
  const density = await sharp(saturation, { raw: { width: size, height: size, channels: 1 } }).blur(16).raw().toBuffer();
  let covered = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2], luma = (r * .3 + g * .59 + b * .11);
    const mask = smooth(.42, .72, saturation[i / 3] / 255) * smooth(.47, .62, density[i / 3] / 255);
    const paint = 150 + luma * .42, stain = .1 + .9 * mask;
    data[i] = paint + (r * .92 - paint) * stain; data[i + 1] = paint + (g * .86 - paint) * stain; data[i + 2] = paint + (b * .8 - paint) * stain;
    orm[i] = 255; orm[i + 1] = 255 * (.34 + .56 * mask + .06 * (1 - luma / 255)); orm[i + 2] = 0;
    covered += mask;
  }
  await save('metal-paint-color', data, size); await save('metal-paint-orm', orm, size);
  await grade('rusty_metal_02', 'nor_gl', 'metal-paint-normal', 1024, keep);
  console.log(`metal-paint rust coverage ${(covered / (size * size) * 100).toFixed(1)}%`);
}

// Charcoal bed: cellular lumps with glowing fissures (original procedural texture, CC0 by the project).
{
  const size = 512, color = Buffer.alloc(size * size * 3), emissive = Buffer.alloc(size * size * 3);
  let seed = 20261115; const random = () => ((seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9 | 0) >>> 0) / 4294967296;
  const cells = Array.from({ length: 120 }, () => [random(), random(), random()]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let first = 9, second = 9, heat = 0;
    for (const [cx, cy, h] of cells) {
      let dx = Math.abs(x / size - cx), dy = Math.abs(y / size - cy); dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
      const d = Math.hypot(dx, dy);
      if (d < first) { second = first; first = d; heat = h; } else if (d < second) second = d;
    }
    const edge = second - first, fissure = 1 - smooth(.002, .016, edge), grain = random();
    const glow = Math.min(1, fissure * (.15 + heat * heat * 1.1) + smooth(.8, 1, heat) * (1 - smooth(0, .07, first)) * .5);
    const ash = smooth(.5, .95, grain) * (1 - fissure) * (.25 + heat * .5), i = (y * size + x) * 3, body = 14 + grain * 16 + ash * 120;
    color[i] = body * 1.02; color[i + 1] = body; color[i + 2] = body * .98;
    emissive[i] = 255 * Math.min(1, glow * 1.25); emissive[i + 1] = 255 * Math.min(1, glow * glow * .62); emissive[i + 2] = 255 * Math.min(1, glow ** 4 * .22);
  }
  await save('coal-color', color, size); await save('coal-emissive', emissive, size);
}

// Six worn prints. The pictures are crops of this project's own HR-AUDIT captures of its world.
{
  const cellW = 512, cellH = 341, atlas = Buffer.alloc(1024 * 1024 * 3, 232);
  const crops = [['last-postcard-close', 0, 140, 585, 390], ['last-postcard-up', 150, 80, 1200, 800], ['sea-wide', 60, 60, 1230, 820],
    ['stream-wide', 180, 120, 1140, 760], ['old-trail-overview', 130, 0, 900, 600], ['first-light-overview', 680, 0, 900, 600]];
  let seed = 77; const random = () => ((seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9 | 0) >>> 0) / 4294967296;
  for (const [index, [id, left, top, width, height]] of crops.entries()) {
    const border = 22, pw = cellW - border * 2, ph = cellH - border * 2;
    const picture = await sharp(`${gallery}/${id}.webp`).extract({ left, top, width, height }).resize(pw, ph, { fit: 'cover' }).removeAlpha().raw().toBuffer();
    const ox = (index % 2) * cellW, oy = Math.floor(index / 2) * cellH;
    const crease = random() < .6 ? Math.floor(cellW * (.3 + random() * .4)) : -1;
    for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) {
      const inside = x >= border && x < cellW - border && y >= border && y < cellH - border, edge = Math.min(x, y, cellW - 1 - x, cellH - 1 - y);
      const corner = Math.min(Math.hypot(x, y), Math.hypot(cellW - x, y), Math.hypot(x, cellH - y), Math.hypot(cellW - x, cellH - y));
      let r = 236, g = 229, b = 211;
      if (inside) {
        const p = ((y - border) * pw + (x - border)) * 3, dx = (x - cellW / 2) / cellW, dy = (y - cellH / 2) / cellH, vignette = 1 - (dx * dx + dy * dy) * .5;
        // Sun-faded offset print: lifted blacks, a warm cast and paper showing through.
        r = (52 + picture[p] * .76) * vignette + 10; g = (48 + picture[p + 1] * .74) * vignette + 8; b = (46 + picture[p + 2] * .66) * vignette;
      }
      const fibre = (random() - .5) * 9, scuff = random() < smooth(34, 0, edge) * .5 + smooth(70, 8, corner) * .5 ? 1 : 0;
      const fold = crease >= 0 && Math.abs(x - crease) < 1.5 ? .45 : 0, foxing = random() < .0009 ? -40 : 0;
      const wear = Math.max(scuff * .7, fold), stain = smooth(60, 0, edge) * 14;
      const i = ((oy + y) * 1024 + ox + x) * 3;
      atlas[i] = Math.min(255, Math.max(0, r + (228 - r) * wear + fibre - stain * .6 + foxing));
      atlas[i + 1] = Math.min(255, Math.max(0, g + (219 - g) * wear + fibre - stain * .8 + foxing));
      atlas[i + 2] = Math.min(255, Math.max(0, b + (198 - b) * wear + fibre - stain * 1.3 + foxing * 1.4));
    }
  }
  await save('postcards-color', atlas, 1024);
}
console.log(`HR-FIX-SETPIECE prepared maps in ${out}`);
