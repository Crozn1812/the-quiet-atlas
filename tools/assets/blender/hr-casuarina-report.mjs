// Evidence only: verifies the single export, matched cameras, assets and metrics.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sharp, meanLuma } from '../../review/luma.mjs';

const evidence = 'tools/assets/blender/hr-casuarina-review';
const staged = 'tools/styleframes/.vite/test-results/hr-casuarina';
const snapshot = JSON.parse(await readFile(`${staged}/source-at-build.json`, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mismatches = [];
for (const [file, hash] of Object.entries(snapshot.hashes)) if (sha(await readFile(file)) !== hash) mismatches.push(file);
if (mismatches.length) throw new Error(`Runtime/config changed since the build: ${mismatches}`);
const manifest = JSON.parse(await readFile('public/world/lib/manifest.json', 'utf8'));
const manifestByteDelta = (await stat('public/world/lib/manifest.json')).size - execFileSync('git', ['show', 'HEAD:public/world/lib/manifest.json']).byteLength;
const entries = manifest.assets.filter(e => e.architecture === 'casuarina');
const files = new Map();
for (const entry of entries) for (const lod of [...entry.lods, entry.impostor]) {
  files.set(lod.path, lod.bytes);
  for (const texture of lod.sharedTextures ?? []) files.set(texture.path, texture.bytes);
}
for (const [path, bytes] of files) {
  if ((await stat(`public${path}`)).size !== bytes) throw new Error(`Wrong byte inventory: ${path}`);
  if (sha(await readFile(`public${path}`)) !== sha(await readFile(`${snapshot.destination}/out${path}`))) throw new Error(`Export differs: ${path}`);
}
const before = JSON.parse(await readFile(`${evidence}/before/metrics.json`, 'utf8'));
const after = JSON.parse(await readFile(`${evidence}/after/metrics.json`, 'utf8'));
const low = JSON.parse(await readFile(`${evidence}/low/metrics.json`, 'utf8'));
const buildId = (await readFile(`${snapshot.destination}/.next/BUILD_ID`, 'utf8')).trim();
if (after.buildId !== buildId || low.buildId !== buildId) throw new Error('Wrong screenshot build');
const visual = [];
for (const sample of after.samples) {
  const prior = before.samples.find(s => s.zone === sample.zone);
  if (JSON.stringify(prior.pose) !== JSON.stringify(sample.pose)) throw new Error(`Camera mismatch: ${sample.zone}`);
  const [a, b] = await Promise.all(['before', 'after'].map(label => sharp(`${evidence}/${label}/${sample.zone}.png`).resize(800, 450).toBuffer()));
  await sharp({ create: { width: 1600, height: 450, channels: 4, background: '#dddddd' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 800, top: 0 }]).png().toFile(`${evidence}/compare-${sample.zone}-high.png`);
  const luma = await meanLuma(await sharp(`${evidence}/after/${sample.zone}.png`).extract({ left: 100, top: 100, width: 1400, height: 550 }).toBuffer());
  visual.push({ zone: sample.zone, sameCamera: true, luma, nonBlack: luma > .04 });
}
const abba = [];
for (const label of ['before-abba1', 'after-abba1', 'after-abba2', 'before-abba2']) {
  const report = JSON.parse(await readFile(`${evidence}/${label}/metrics.json`, 'utf8'));
  abba.push({ label, samples: report.samples.map(s => ({ zone: s.zone, fps: s.fps, cpuMsPerSecond: s.cpuMsPerSecond, calls: s.calls, triangles: s.triangles })) });
}
const e2e = await readFile(`${evidence}/e2e.log`, 'utf8');
const tests = await readFile(`${evidence}/test-final.log`, 'utf8');
const firstCasuarinaStartMs = Math.min(...after.resources.filter(r => r.url.includes('/hr-tree-casuarina-')).map(r => r.start));
const addedAssetBytes = [...files.values()].reduce((s, b) => s + b, 0);
const abbaSummary = after.samples.map(({ zone }) => {
  const mean = variant => { const samples = abba.filter(r => r.label.startsWith(variant)).map(r => r.samples.find(s => s.zone === zone)); return samples.reduce((s, r) => s + r.cpuMsPerSecond, 0) / samples.length; };
  const beforeCpuMsPerSecond = mean('before'), afterCpuMsPerSecond = mean('after');
  return { zone, beforeCpuMsPerSecond, afterCpuMsPerSecond, deltaPercent: (afterCpuMsPerSecond / beforeCpuMsPerSecond - 1) * 100 };
});
const report = { buildId, sourceHashParity: mismatches.length === 0, addedAssetBytes, manifestByteDelta, addedPublicBytes: addedAssetBytes + manifestByteDelta,
  deferred: firstCasuarinaStartMs > after.timing.playable, firstPlayableMs: after.timing.playable - after.timing.clicked,
  casuarinaBytesBeforePlay: after.resources.filter(r => r.url.includes('/hr-tree-casuarina-') && r.start < after.timing.playable).reduce((s, r) => s + r.bytes, 0),
  firstCasuarinaStartMs,
  firstPlayableTimestamp: after.timing.playable,
  assets: entries.map(e => ({ id: e.id, lods: [...e.lods, e.impostor].map(l => ({ level: l.level ?? 'impostor', triangles: l.triangles, draws: l.drawCalls, bytes: l.bytes })) })),
  high: after.samples, low: low.samples, visual, abba, abbaSummary,
  gates: { world43: /43 passed/.test(e2e), unit: /Test Files\s+\d+ passed/.test(tests) && !/\d+ failed/.test(tests),
    assets: (await readFile(`${evidence}/assets.log`, 'utf8')).includes('"status":"PASS"'),
    licenses: (await readFile(`${evidence}/licenses.log`, 'utf8')).includes('RESULT: PASS'),
    high60: after.samples.length === 2 && after.samples.every(s => s.fps >= 60 && s.quality === 'high' && s.gpu.includes('RTX 3060')),
    deferredAfterPlay: firstCasuarinaStartMs > after.timing.playable,
    cameraAndNonBlack: visual.every(v => v.sameCamera && v.nonBlack) } };
await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ buildId, addedPublicBytes: report.addedPublicBytes, gates: report.gates, firstPlayableMs: report.firstPlayableMs }));
if (Object.values(report.gates).some(value => !value)) process.exitCode = 1;
