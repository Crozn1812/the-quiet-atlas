import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
const root = 'test-results/hr-tree2';
const read = label => readFile(`${root}/${label}/metrics.json`, 'utf8').then(JSON.parse);
const [a1, b1, b2, a2, low] = await Promise.all(['abba-a1-final', 'after-final', 'abba-b2-final', 'abba-a2-final', 'low-final'].map(read));
const e2eLog = await readFile('tmp/hr-tree2-resume-e2e.log', 'utf16le');
const worldPass = /43 passed/.test(e2eLog) && !/\d+ failed/.test(e2eLog);
const worldPassed = e2eLog.match(/(\d+) passed/)?.[1] ?? '?';
async function bytes(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const sizes = await Promise.all(entries.map(e => e.isDirectory() ? bytes(path.join(dir, e.name)) : stat(path.join(dir, e.name)).then(s => s.size)));
  return sizes.reduce((a, b) => a + b, 0);
}
const [beforeBytes, afterBytes] = await Promise.all(['coverage/hr-tree2-baseline/out/_next', 'out/_next'].map(bytes));
const footprint = m => {
  const assets = new Map();
  for (const r of m.resources ?? []) { const key = r.name.replace(/^https?:\/\/[^/]+/, ''); assets.set(key, Math.max(assets.get(key) ?? 0, r.bytes)); }
  return [...assets.values()].reduce((a, b) => a + b, 0);
};
const time = m => m.timing.playable - m.timing.clicked;
const number = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const row = (label, m, zone = m.zones[0]) => `| ${label} | ${number(zone.triangles)} | ${number(zone.calls)} | ${number(zone.cpuTaskMsPerSecond)} | ${number(zone.fps)} | ${number(time(m))} | ${number(footprint(m))} |`;
const report = `# HR-TREE2 — evidence, 2026-11-14

Status: **${worldPass ? 'PASS — world 43/43' : `FAIL — world ${worldPassed}/43`}**. Final log: \`tmp/hr-tree2-resume-e2e.log\`. Vehicle rerun: 2 passed, 1 failed (\`tmp/hr-tree2-resume-vehicle.log\`). Visual photoreal acceptance remains unconfirmed.

Final build/screenshots/ABBA include the impostor UV correction, viewport readiness gate, per-tree frustum culling, resident instance buffers, original shadow policy and cadence-adaptive geometry LOD. Recovery ran one production build; earlier evidence is retained in the folders without the \`-final\` suffix. Baseline uses the preserved pre-HR export, with the same poses and capture code.

GPU of headed captures: ${b1.gpu}. E2e uses the default Edge SwiftShader launch args and 2 workers. These are different renderer paths.

## World measurements

All frames include visible world, shadow and post draws. CPU = CDP renderer TaskDuration delta / measured Timestamp delta; excludes GPU process CPU. FPS uses rAF intervals with intercepted WebGL draw calls. ABBA measured serially on a shared machine; no controlled Iris Xe or isolated GPU benchmark.

| Session / zone | Triangles/frame | Draw/frame | CPU task ms/s | FPS | Click→playable ms | Unique library body B |
|---|---:|---:|---:|---:|---:|---:|
${row('A1 old / First Light', a1)}
${row('B1 HR / First Light', b1)}
${row('B2 HR / First Light', b2)}
${row('A2 old / First Light', a2)}
${row('Low / First Light', low)}
${b1.zones.slice(1).map(z => row(z.zone, b1, z)).join('\n')}

The body column counts each library URL once, using ResourceTiming encodedBodySize. It describes loaded asset footprint, not actual wire transfer (which may reuse browser cache). The B1 footprint covers the whole four-zone session; A1/B2/A2/Low cover First Light only.

Playable = Enter World click → DOM build=done and intro=done, with QA skip intro. These timers include existing deferred dressing. Capture Low switches through the menu after entering the default quality, so its request history may include earlier HR requests; the unit test independently verifies that a controller initially set to Low never fetches HR.

Public asset byte addition: **0 B**; all HR GLB/KTX2 were already shipped by HR-TREE1. Entire generated _next footprint: ${beforeBytes} → ${afterBytes} B (**${afterBytes - beforeBytes >= 0 ? '+' : ''}${afterBytes - beforeBytes} B**). This is an artifact total, not an initial navigation payload.

## Pictures

Each row links High before/after at the same fixed player-relative pose. Four forest zones × near/mid/far = 12 pairs. Sources are unmodified 1600×900 browser screenshots.

| Zone | Near | Mid | Far |
|---|---|---|---|
${b1.zones.map(z => `| ${z.zone} | [before](before/${z.zone}-near.png) / [after](after-final/${z.zone}-near.png) | [before](before/${z.zone}-mid.png) / [after](after-final/${z.zone}-mid.png) | [before](before/${z.zone}-far.png) / [after](after-final/${z.zone}-far.png) |`).join('\n')}

[Low](low-final/first-light-mid.png). Raw metrics: [A1](abba-a1-final/metrics.json), [B1](after-final/metrics.json), [B2](abba-b2-final/metrics.json), [A2](abba-a2-final/metrics.json), [Low](low-final/metrics.json).

Captured page/console errors: ${[a1, b1, b2, a2, low].reduce((n, m) => n + m.errors.length, 0)}. Visual photoreal acceptance is **not confirmed**.
`;
await writeFile(`${root}/report.md`, report);
console.log(report);
