import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = 'test-results/hr-light';
const labels = ['r2-before-1', 'r2-after-1', 'r2-after-2', 'r2-before-2', 'r2-low'];
const runs = await Promise.all(labels.map(async label => JSON.parse(await readFile(`${root}/${label}/metrics.json`, 'utf8'))));
async function jsBytes(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await jsBytes(file);
    else if (entry.name.endsWith('.js')) total += (await stat(file)).size;
  }
  return total;
}
const previous = JSON.parse(await readFile('tmp/hr-light/round2-baseline-bytes.json', 'utf8'));
const currentJsBytes = await jsBytes('out/_next/static');
const n = v => Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : 'N/A';
const rows = runs.flatMap(run => run.zones.map(zone => ({ run: run.label, ...zone,
  interactiveMs: run.timing.interactive - run.timing.click,
  dressingReadyMs: run.timing.playable - run.timing.click,
})));
const columns = ['Run', 'Zone', 'Triangles/frame', 'Draws/frame', 'CPU task ms/s', 'FPS', 'Interactive ms', 'Dressing ready ms'];
const cells = r => [r.run, r.zone, n(r.triangles), n(r.calls), n(r.cpuTaskMsPerSecond), n(r.fps), n(r.interactiveMs), n(r.dressingReadyMs)];
const table = [columns.join(' | '), columns.map(() => '---').join(' | '), ...rows.map(r => cells(r).join(' | '))].map(r => `| ${r} |`).join('\n');
const summary = {
  gpu: runs[0].gpu, order: labels, currentJsBytes, round1JsBytes: previous.round1OutJsBytes,
  exportJsDeltaBytes: currentJsBytes - previous.round1OutJsBytes, addedPublicAssetBytes: 0, rows,
  rootsABBA: runs.find(r => r.rootsABBA)?.rootsABBA,
  profiles: runs.find(r => r.profiles)?.profiles,
  caveats: [
    'One final production build after rebase, 1600x900 DPR1, native Edge RTX3060. Effects off/on uses an in-memory event gated by the existing QA journey.',
    'Before is an ablation of HR-LIGHT on that SAME build: no floor/rays, aerial early return, original AO strength. Other assets including HR-ROOTS-SIGN are identical. It is not a checkout of the old commit.',
    'Whole-renderer draws include shadows and post. CPU is CDP TaskDuration / wall time, not GPU time. Shared workstation, observational ABBA.',
    'JS delta compares the existing round-1 export to the rebased final export and includes changes from rebase. Both A/B modes deliver identical JS bytes.',
    'Analytic ribbons are approximate volumes with scene depth occlusion, not shadow-map volumetric integration. Density fades near the camera and at distance.',
  ],
};
await writeFile(`${root}/r2-summary.json`, JSON.stringify(summary, null, 2));
await writeFile(`${root}/r2-metrics.md`, `${table}\n\n${summary.caveats.join('\n\n')}\n`);
const shots = ['first-light', 'first-light-rays', 'first-light-forest', 'roots', 'roots-sun', 'horizon', 'horizon-slope'];
const pairs = shots.map(zone => `<h2>${zone}</h2><div class="pair"><figure><figcaption>Before: HR-LIGHT off / High</figcaption><img loading="lazy" src="r2-before-2/${zone}.png"></figure><figure><figcaption>After: HR-LIGHT on / High</figcaption><img loading="lazy" src="r2-after-2/${zone}.png"></figure></div>`).join('');
await writeFile(`${root}/r2-index.html`, `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>HR-LIGHT round 2</title><style>body{background:#17201e;color:#eee8d8;font:16px system-ui;margin:24px}h1{font-weight:500}h2{margin-top:32px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{padding:8px 0}img{width:100%;height:auto}table{border-collapse:collapse;font-size:13px}td,th{padding:8px;border:1px solid #536259;text-align:right}p{max-width:1100px;line-height:1.6}@media(max-width:900px){.pair{grid-template-columns:1fr}}</style><h1>HR-LIGHT — round 2</h1><p>${summary.gpu}. 1600×900 DPR1, High. ABBA on the same final export; before = effects off, after = effects on. Rebased tree/sign assets are identical. Same fixed poses; wind/idle animation phase can differ.</p><p>Look at the shafts below the canopy in roots-sun and first-light-rays, brown/yellow curled litter, the hill grass in horizon-slope, and blue-grey distant hills. Images are evidence for this ticket, not a photoreal certification of legacy assets.</p>${pairs}<h2>Low</h2><img loading="lazy" src="r2-low/first-light.png"><h2>Measurements</h2><table><tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>${rows.map(r => `<tr>${cells(r).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table><h2>Roots: same-session ABBA</h2><pre>${JSON.stringify(summary.rootsABBA, null, 2)}</pre>${summary.caveats.map(c => `<p>${c}</p>`).join('')}<p>Export JS ${n(previous.round1OutJsBytes)} → ${n(currentJsBytes)} bytes; delta includes rebase. Public assets +0 bytes.</p></html>`);
console.log(table);
console.log(`Export JS ${previous.round1OutJsBytes} -> ${currentJsBytes}; delta ${summary.exportJsDeltaBytes} bytes (includes rebase), assets +0 bytes.`);
