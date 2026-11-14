import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { sharp } from '../../tools/review/luma.mjs';

const directory = 'test-results/hr-terrain-cliff/return1';
sharp.concurrency(1);
for (const label of ['before', 'after']) {
  await copyFile(`test-results/hr-gd110/world-terrain-return1-${label}/driving.png`, `${directory}/${label}/driving.png`);
}
const names = ['first-light', 'spring-ribbon', 'spring-west', 'spring-central', 'spring-east', 'spring-end', 'driving', 'crest'];
const layers = [];
for (const [row, name] of names.entries()) {
  for (const [column, label] of ['before', 'after'].entries()) {
    layers.push({ input: await sharp(`${directory}/${label}/${name}.png`).resize(800, 450).toBuffer(), left: column * 800, top: row * 486 + 36 });
  }
  layers.push({ input: Buffer.from(`<svg width="1600" height="36"><rect width="1600" height="36" fill="#eee8d8"/><text x="16" y="25" font-family="Arial" font-size="20">BEFORE (round 0) — ${name}</text><text x="816" y="25" font-family="Arial" font-size="20">AFTER (round 1) — ${name}</text></svg>`), left: 0, top: row * 486 });
}
await sharp({ create: { width: 1600, height: names.length * 486, channels: 3, background: '#eee8d8' } }).composite(layers).webp({ quality: 90 }).toFile(`${directory}/comparison.webp`);
await writeFile(`${directory}/comparison.html`, `<!doctype html><meta charset="utf-8"><title>HR Terrain Cliff — round 1</title><style>body{background:#eee8d8;color:#282820;font:16px Arial;margin:20px}div{display:grid;grid-template-columns:1fr 1fr;gap:6px}img{width:100%}h2{font-size:18px}</style><h1>High: before / after, round 1</h1><p>Same poses, 1600×900, Edge / RTX 3060. Click for full resolution.</p>${names.map(name => `<h2>${name}</h2><div>${['before', 'after'].map(label => `<a href="${label}/${name}.png"><img alt="${label} ${name}" src="${label}/${name}.png"></a>`).join('')}</div>`).join('')}<h2>Low</h2><img alt="Low" src="low/first-light.png">`);

const sources = ['materials/cc0.ts', 'materials/cliff.ts', 'terrain/mesh.ts', 'terrain/cliff-relief.ts', 'terrain/cliffs.ts', 'zones/first-light-cliff-cull.ts'];
const identity = { buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), sources: await Promise.all(sources.map(async source => {
  const file = `src/features/world/${source}`;
  return { file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') };
})) };
await writeFile(`${directory}/build-identity.json`, JSON.stringify(identity, null, 2));
async function bundle(directory) {
  let raw = 0, gzip = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) { const size = await bundle(path); raw += size.raw; gzip += size.gzip; }
    else if (path.endsWith('.js')) { const data = await readFile(path); raw += data.length; gzip += gzipSync(data, { level: 9 }).length; }
  }
  return { raw, gzip };
}
const before = await bundle('node_modules/.cache/hr-terrain-baseline/_next'), after = await bundle('out/_next');
const bytes = { publicAssetsAdded: 0, before, after, delta: { raw: after.raw - before.raw, gzip: after.gzip - before.gzip } };
await writeFile(`${directory}/bytes.json`, JSON.stringify(bytes, null, 2));
console.log(JSON.stringify({ identity, bytes }, null, 2));
