import { readFile, writeFile } from 'node:fs/promises';
const root = 'test-results/hr-props';
const read = async label => JSON.parse(await readFile(`${root}/${label}/metrics.json`, 'utf8'));
const [a1, b1, b2, a2, low] = await Promise.all(['before', 'after', 'after-repeat', 'before-repeat', 'low'].map(read));
const inventory = JSON.parse(await readFile('tmp/hr-props/packaged.json', 'utf8'));
const f = n => Number(n).toFixed(2);
const lines = [
  'HR-PROPS — production evidence', '',
  `GPU: ${b1.gpu}. Edge hardware WebGL, 1600×900, DPR 1. Camera poses are copied exactly from A1; every sample checks High/Low, focus and visibility. Warmup 25 s, sample 5 s. Sequence A1 → B1 → B2 → A2, with the single production build between A1/B1. The workstation is shared; no claim of isolated speedup.`, '',
  `New public payload: ${inventory.addedBytes.toLocaleString('en-US')} bytes, 19 assets / 38 GLBs / 3 shared KTX2 atlases. Four hill tree architectures reuse the existing HR-TREE1 inventory and add no new public files.`, '',
  '| Zone | A1 FPS | B1 FPS | B2 FPS | A2 FPS | CPU A mean ms/s | CPU B mean ms/s | B1 draw | B1 triangles |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
];
for (const before of a1.samples) {
  const samples = [before, ...[b1, b2, a2].map(r => r.samples.find(s => s.zone === before.zone))];
  if (samples.some(s => JSON.stringify(s.pose) !== JSON.stringify(before.pose))) throw new Error(`Pose mismatch ${before.zone}`);
  lines.push(`| ${before.zone} | ${samples.map(s => f(s.fps)).join(' | ')} | ${f((samples[0].cpuMsPerSecond + samples[3].cpuMsPerSecond) / 2)} | ${f((samples[1].cpuMsPerSecond + samples[2].cpuMsPerSecond) / 2)} | ${f(samples[1].calls)} | ${Math.round(samples[1].triangles).toLocaleString('en-US')} |`);
}
lines.push('', '| Zone | A1 draw / triangle | B1 draw / triangle | Low FPS / draw / triangle | High before / after / Low |', '|---|---:|---:|---:|---|');
for (const a of a1.samples) {
  const b = b1.samples.find(s => s.zone === a.zone), l = low.samples.find(s => s.zone === a.zone);
  lines.push(`| ${a.zone} | ${f(a.calls)} / ${Math.round(a.triangles)} | ${f(b.calls)} / ${Math.round(b.triangles)} | ${f(l.fps)} / ${f(l.calls)} / ${Math.round(l.triangles)} | [A](before/${a.zone}.png) / [B](after/${a.zone}.png) / [Low](low/${a.zone}.png) |`);
}
lines.push('', '| Run | Click → playable ms | Earliest new prop request after playable ms | Browser errors |', '|---|---:|---:|---:|');
for (const r of [a1, b1, b2, a2, low]) {
  const requests = r.resources.filter(t => /\/world\/lib\/hr-(prop|rock|palm)-/.test(t.url));
  const first = requests.length ? Math.min(...requests.map(t => t.start)) - r.timing.playable : null;
  lines.push(`| ${r.label} | ${f(r.timing.playable - r.timing.clicked)} | ${first === null ? 'none' : f(first)} | ${r.errors.length} |`);
  if (first !== null && first < 0) throw new Error('Prop request preceded playable');
}
const pass = [b1, b2].every(r => r.samples.every(s => s.fps >= 60));
lines.push('', `High ≥60 FPS for all measured B samples: **${pass ? 'PASS' : 'FAIL'}**. This is the measured camera set, not a guarantee over the entire world.`, '',
  'Known scope limit: global foliage/terrain plants and structural/interactable rock meshes are still owned by their existing systems. This ticket replaces selected zone dressing, adds safe High palms/hill trees, and preserves Low; it does not establish that every old low-poly object in High has been removed. Photoreal acceptance remains a Lead art review.', '',
  'Asset inspection: [LOD0](assets/lod0.png), [LOD1](assets/lod1.png), [decoder validation](assets/validation.json). All decoded GLBs retain base-color, normal and roughness textures. The delivered 2048 atlas has four 1024 tiles; repigmented vegetation uses photographed grain with authored veins, rather than a claim of scanned botanical leaves.', '');
await writeFile(`${root}/report.md`, lines.join('\n'));
console.log(JSON.stringify({ samples: a1.samples.length * 5, high60Fps: pass, addedBytes: inventory.addedBytes }));
