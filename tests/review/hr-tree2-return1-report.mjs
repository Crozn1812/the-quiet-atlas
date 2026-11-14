// Regenerate only from the final export's captured evidence and actual gate log.
import { readFile, readdir, stat, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
const root = 'test-results/hr-tree2';
const read = name => readFile(`${root}/${name}/metrics.json`, 'utf8').then(JSON.parse);
const [before, after, low] = await Promise.all(['return1-before', 'return1-after', 'low-return1'].map(read));
const log = await readFile('tmp/hr-tree2-return1-e2e.log', 'utf16le');
const lastRun = JSON.parse(await readFile('test-results/e2e-artifacts/.last-run.json', 'utf8'));
const pass = /43 passed/.test(log) && !/\d+ failed/.test(log) && lastRun.status === 'passed' && lastRun.failedTests.length === 0;
const n = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const lines = [];
for (const label of ['hr', 'blocked']) for (const scenario of ['brake', 'rolling']) {
  const result = JSON.parse(await readFile(`${root}/profile-${label}/${scenario}.json`, 'utf8'));
  const frames = result.render.frames.filter(f => f.at >= result.samples[0].ms);
  lines.push(`| ${label} | ${scenario} | ${result.phase} | ${n(frames.reduce((s, f) => s + f.ms, 0) / frames.length)} | ${n(Math.max(...frames.map(f => f.ms)))} |`);
}
async function bytes(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const sizes = await Promise.all(entries.map(e => e.isDirectory() ? bytes(path.join(dir, e.name)) : stat(path.join(dir, e.name)).then(s => s.size)));
  return sizes.reduce((a, b) => a + b, 0);
}
const [oldBytes, newBytes] = await Promise.all(['coverage/hr-tree2-baseline/out/_next', 'out/_next'].map(bytes));
const footprint = m => [...new Map((m.resources ?? []).map(r => [new URL(r.name).pathname, r.bytes])).values()].reduce((a, b) => a + b, 0);
const row = (label, m, z) => `| ${label} / ${z.zone} | ${n(z.triangles)} | ${n(z.calls)} | ${n(z.cpuTaskMsPerSecond)} | ${n(z.fps)} | ${n(m.timing.playable - m.timing.clicked)} | ${n(footprint(m))} |`;
const report = `# HR-TREE2 — return 1, 2026-11-14

Status: **${pass ? 'PASS — world 43/43' : 'FAIL — inspect e2e log'}**. Default Playwright config, SwiftShader, workers=2, no retries added or assertion changes. Log: \`tmp/hr-tree2-return1-e2e.log\`. One production build in this return, using WASM + webpack. No commit.

Windows teardown note: after all 43 tests passed, Playwright's spawned webserver remained alive and delayed finalization. Stopping only that server (PID 28252, identified in its log) let the unchanged runner print \`43 passed (7.5m)\` and exit 0. The test runner was not stopped. Last-run status is passed, with no failed tests. A lint attempt during e2e read temporary generated trace JS; the final normal lint after those files were removed passes with zero warnings and no config changes.

## Cause and correction

The original trace's brake assertion spent 5.886 s waiting for two rAF callbacks; the other failing scenario could not finish mounting in 15 s. Read-only ablation on the same pre-fix export, with two parallel software sessions, reproduces both failures. Blocking only HR assets makes both actions pass with their original deadlines. Coordinates, physics and colliders are unchanged. This isolates HR streaming/first-use uploads/programs/render work as the regression; the ablation does not separately apportion decode, shader compilation and rasterization.

| Pre-fix export | Action | Final phase | Mean rendered interval ms | Max interval ms |
|---|---|---|---:|---:|
${lines.join('\n')}

Raw profiles: [HR brake](profile-hr/brake.json), [HR rolling](profile-hr/rolling.json), [blocked brake](profile-blocked/brake.json), [blocked rolling](profile-blocked/rolling.json). These are diagnostics, not additional official e2e passes. Failed original traces are preserved in \`return1-original-traces/\`.

CPU rasterizers (SwiftShader/llvmpipe/softpipe/software rasterizer reported by WebGL) now retain the complete static procedural forest, even with High selected. No HR load, upload, shader or extra understorey work begins. This costs visual detail on software rendering. Hardware High retains the HR assets. Mask materials are created only after a replacement arrives; stationary camera/LOD selection and unchanged replacement buffers no longer rebuild every frame. Low retains its existing cheap fallback.

Vines now have narrow brown stems and small folded, alternating moss leaves along the actual curved strand. They use ordinary canopy lighting and vertex pigment, without the crown's bright tint or added leaf backlight. Imported ivy wood is also subdued. The green flat Roots/elf root cap belongs to \`zones/roots.ts\`'s authored moss geometry; recorded, not edited.

## Pictures

Before = the rebased worktree export returned by Lead; after = the final production build. Same capture script, fixed player-relative near/mid/far cameras, 1600×900, hardware High. Wind/fog/streaming are live, so these are not pixel-identical snapshots.

| Zone | Near | Mid | Far |
|---|---|---|---|
${after.zones.map(z => `| ${z.zone} | [before](return1-before/${z.zone}-near.png) / [after](return1-after/${z.zone}-near.png) | [before](return1-before/${z.zone}-mid.png) / [after](return1-after/${z.zone}-mid.png) | [before](return1-before/${z.zone}-far.png) / [after](return1-after/${z.zone}-far.png) |`).join('\n')}

[Low near](low-return1/first-light-near.png), [Low mid](low-return1/first-light-mid.png), [Low far](low-return1/first-light-far.png). Original pre-HR comparison and historical ABBA remain in [previous report](report.md); that report's failed gate is superseded by this return.

## Measurements

| Capture / zone | Triangles/frame | Draw/frame | CPU task ms/s | FPS | Click→playable ms | Unique library body B |
|---|---:|---:|---:|---:|---:|---:|
${[...before.zones.map(z => row('Before return', before, z)), ...after.zones.map(z => row('After return', after, z)), ...low.zones.map(z => row('Low', low, z))].join('\n')}

GPU: ${after.gpu}. Captures include world/shadow/post draws. CPU is renderer CDP TaskDuration, excluding GPU process CPU. The before/after table is diagnostic on a shared machine, not a controlled speedup claim or a replacement for the historical ABBA table. ResourceTiming body totals count unique library URLs across the session, not actual wire traffic. Low is selected after entry and can therefore include earlier default-quality requests.

Public bytes added: **0 B**. Full generated _next: ${n(oldBytes)} → ${n(newBytes)} B, delta **${n(newBytes - oldBytes)} B** relative to preserved pre-HR export; not an initial payload measurement. Page/console capture errors: ${[before, after, low].reduce((s, m) => s + m.errors.length, 0)}. No photoreal acceptance claim.
`;
// A report must not silently link missing evidence.
const links = [...report.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]);
await Promise.all(links.map(link => access(path.resolve(root, link))));
await writeFile(`${root}/return1-report.md`, report);
console.log(`Report: ${pass ? 'PASS 43/43' : 'FAIL'}; ${links.length} evidence links verified`);
if (!pass) process.exitCode = 1;
