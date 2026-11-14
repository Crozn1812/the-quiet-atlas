import { readFile, writeFile } from 'node:fs/promises';

const root = 'test-results/perf-hr';
const before = JSON.parse(await readFile(`${root}/before/metrics.json`, 'utf8'));
const after = JSON.parse(await readFile(`${root}/${process.argv[2] ?? 'after'}/metrics.json`, 'utf8'));
const sampleKey = sample => `${sample.size.join('x')}/${sample.zone}/${sample.quality}`;
const expected = new Set([1600, 1920].flatMap(width => ['first-light', 'roots', 'workshop', 'quiet-shore']
  .flatMap(zone => ['high', 'balanced', 'low'].map(quality => `${width}x${width === 1600 ? 900 : 1080}/${zone}/${quality}`))));
for (const capture of [before, after]) {
  const keys = new Set(capture.samples.map(sampleKey));
  if (capture.samples.length !== expected.size || keys.size !== expected.size || [...expected].some(key => !keys.has(key)))
    throw new Error(`${capture.label}: expected exactly one sample per resolution/zone/quality (24 total)`);
  if (capture.errors.length || !/NVIDIA GeForce RTX 3060\b/.test(capture.gpu))
    throw new Error(`${capture.label}: capture errors or unexpected GPU: ${capture.gpu}`);
  for (const sample of capture.samples) {
    if (![sample.fps, sample.calls, sample.triangles, sample.seconds, sample.frames].every(value => Number.isFinite(value) && value > 0))
      throw new Error(`${capture.label}: invalid measurements for ${sampleKey(sample)}`);
    const passes = Object.values(sample.owners);
    if (Math.abs(passes.reduce((sum, pass) => sum + pass.calls, 0) - sample.calls) > 0.01
      || Math.abs(passes.reduce((sum, pass) => sum + pass.triangles, 0) - sample.triangles) > 0.01)
      throw new Error(`${capture.label}: pass totals do not match ${sampleKey(sample)}`);
  }
}
const passes = sample => {
  const result = { color: [0, 0], shadow: [0, 0], post: [0, 0] };
  for (const [key, value] of Object.entries(sample.owners)) {
    const sum = result[key.split('|')[0]] ??= [0, 0]; sum[0] += value.calls; sum[1] += value.triangles;
  }
  return Object.entries(result).map(([key, value]) => `${key}: ${value[0].toFixed(1)} / ${Math.round(value[1]).toLocaleString('en-US')}`).join('; ');
};
const lines = [`GPU before: ${before.gpu}`, `GPU after: ${after.gpu}`, '',
  `Before capture: ${before.source}. After capture: ${after.source}.`,
  ...(before.source !== after.source ? ['Capture modes differ: these columns reproduce the raw measurements; they do not establish a controlled speedup.'] : []), '',
  'FPS = frames with WebGL draws / sample wall time. Draws and triangles include every pass.', '',
  '| Size | Zone | Quality | FPS before → after | Draws before → after | Triangles before → after | Before passes: draws / triangles | After passes: draws / triangles |',
  '|---|---|---|---:|---:|---:|---|---|'];
let pass = true, lowStable = true;
for (const sample of after.samples) {
  const old = before.samples.find(s => s.zone === sample.zone && s.quality === sample.quality && s.size.join() === sample.size.join());
  if (!old) throw new Error(`No baseline for ${sample.zone}/${sample.quality}/${sample.size}`);
  if (JSON.stringify(old.pose) !== JSON.stringify(sample.pose)) throw new Error(`Camera pose differs for ${sampleKey(sample)}`);
  if (sample.quality !== 'low' && sample.size[0] === 1600 && sample.fps < 60) pass = false;
  if (sample.quality === 'low' && (Math.round(old.calls) !== Math.round(sample.calls) || Math.round(old.triangles) !== Math.round(sample.triangles))) lowStable = false;
  lines.push(`| ${sample.size.join('×')} | ${sample.zone} | ${sample.quality} | ${old.fps.toFixed(2)} → ${sample.fps.toFixed(2)} | ${old.calls.toFixed(1)} → ${sample.calls.toFixed(1)} | ${Math.round(old.triangles).toLocaleString('en-US')} → ${Math.round(sample.triangles).toLocaleString('en-US')} | ${passes(old)} | ${passes(sample)} |`);
}
lines.push('', `1600×900 High/Balanced ≥60 FPS: **${pass ? 'PASS' : 'FAIL'}**.`, '',
  `Low draw/triangle counts unchanged at all eight samples: **${lowStable ? 'PASS' : 'FAIL'}**.`, '',
  'Source-harness and production captures are labeled independently; compare equivalent modes. Live wind, birds, streaming and workstation load can affect FPS and pixels.');
await writeFile(`${root}/comparison-${after.label}.md`, lines.join('\n'));
await writeFile(`${root}/comparison-${after.label}.html`, `<!doctype html><meta charset="utf-8"><title>PERF-HR before/after</title><style>body{font:16px system-ui;background:#171c1a;color:#eee;margin:24px}section{margin-bottom:40px}.pair{display:flex;gap:8px}figure{margin:0;width:50%}img{width:100%}button{padding:8px;margin:4px}body.blink figure:first-child{display:none}body.blink figure:last-child{width:100%}</style><h1>PERF-HR same-camera High captures</h1><button onclick="document.body.classList.toggle('blink')">Toggle after at full width</button>${after.samples.filter(s => s.quality === 'high').map(s => { const name = `${s.size.join('x')}-${s.zone}.png`; return `<section><h2>${s.zone} ${s.size.join('×')}</h2><div class="pair"><figure><figcaption>Before</figcaption><img src="before/${name}"></figure><figure><figcaption>${after.label}</figcaption><img src="${after.label}/${name}"></figure></div></section>`; }).join('')}`);
console.log(`Samples ${after.samples.length}; 1600×900 High/Balanced ≥60 FPS: ${pass ? 'PASS' : 'FAIL'}; Low counts unchanged: ${lowStable ? 'PASS' : 'FAIL'}`);
if (!pass || !lowStable || after.errors.length || after.samples.length !== 24) process.exitCode = 1;
