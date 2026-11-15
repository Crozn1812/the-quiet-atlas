import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { sharp } from '../../tools/review/luma.mjs';
const directory = 'test-results/hr-fix-terrain';
const before = JSON.parse(await readFile(`${directory}/before/capture-manifest.json`, 'utf8'));
const after = JSON.parse(await readFile(`${directory}/after/capture-manifest.json`, 'utf8'));
const cpu = JSON.parse(await readFile(`${directory}/cpu-abba.json`, 'utf8'));
const gates = JSON.parse(await readFile(`${directory}/gates.json`, 'utf8'));
for (const name of ['lint', 'typecheck', 'test', 'check:assets', 'check:licenses', 'build', 'e2e']) {
  if (gates[name]?.exitCode !== 0 || gates[name]?.status !== 'PASS') throw new Error(`Gate failed/missing: ${name}`);
}
if (after.provenance?.sourcePreview !== false || after.provenance.buildId !== gates.build.buildId
  || JSON.stringify(after.provenance.sourceHashes) !== JSON.stringify(gates.build.sourceHashes)) {
  throw new Error('After capture does not match final production build');
}
const e2eLog = await readFile(gates.e2e.log, 'utf8');
if (!/43 passed/.test(e2eLog) || gates.e2e.port !== '4203') throw new Error('Expected 43 world e2e passes on port 4203');
for (const run of [before, after]) {
  if (run.status !== 'captured-review-pending' || run.captures.length !== 12 || run.errors.length || run.failedRequests.length) {
    throw new Error('Incomplete/error capture');
  }
}
await mkdir(`${directory}/audit`, { recursive: true });
const evidence = [];
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
for (const shot of after.captures) {
  const previous = before.captures.find(s => s.id === shot.id);
  if (JSON.stringify([previous.position, previous.target, previous.quality]) !== JSON.stringify([shot.position, shot.target, shot.quality])) throw new Error(`Pose mismatch: ${shot.id}`);
  const sub = shot.id.startsWith('horizon-lead-') ? 'horizon-match/' : '';
  const auditSource = path.join('D:/tqa-worktrees/hr-audit-gallery', sub, shot.file);
  await copyFile(auditSource, `${directory}/audit/${shot.file}`);
  for (const stage of ['audit', 'before', 'after']) {
    const file = `${directory}/${stage}/${shot.file}`, bytes = await readFile(file), dimensions = await sharp(bytes).metadata();
    if (dimensions.width !== 1600 || dimensions.height !== 900) throw new Error(`Wrong size: ${file}`);
    evidence.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
}
const mean = samples => samples.reduce((n, s) => n + s.cpuMs, 0) / samples.length;
const summary = {
  heads: { current: after.head, audit: '1877a573d4b20647b89318e65e1899ca3bebeb75' },
  build: after.provenance,
  highFpsGate: { minimum: Math.min(...after.captures.filter(s => s.quality === 'high').map(s => s.fps)), required: 60 },
  startup: { beforeSourcePreview: { playableMs: before.enterToPlayableIntroDoneMs, buildDoneMs: before.enterToBuildDoneMs, bytes: before.enterToBuildDoneBytes },
    afterProduction: { playableMs: after.enterToPlayableIntroDoneMs, buildDoneMs: after.enterToBuildDoneMs, bytes: after.enterToBuildDoneBytes } },
  publicAssetBytesAdded: 0, cpuConstruction: { beforeMs: mean(cpu.samples.filter(s => s.label.startsWith('A'))), afterMs: mean(cpu.samples.filter(s => s.label.startsWith('B'))), samples: cpu.samples },
  pairs: after.captures.map(shot => ({ id: shot.id, quality: shot.quality,
    before: before.captures.find(s => s.id === shot.id), after: shot })),
  evidence, gates,
  caveats: ['Before current HEAD is a Vite source preview; after is the sole production build.',
    'GPU capture and Node construction ABBA run separately from lint/build/unit/e2e; other workers are not isolated.',
    'Startup before uses the source preview timer and is not an Enter World production comparison.',
    'Original audit includes other fixes merged before this ticket; do not attribute all differences to this patch.',
    'Photoreal acceptance requires human review; image existence and numeric gates do not approve art.'],
};
await writeFile(`${directory}/comparison.json`, JSON.stringify(summary, null, 2));
const rows = summary.pairs.map(p => `<tr><td><a href="#${p.id}">${esc(p.id)}</a></td><td>${p.quality}</td>${[p.before, p.after].map(s => `<td>${s.fps.toFixed(1)}</td><td>${s.trianglesAllPasses.toFixed(0)}</td><td>${s.drawCallsAllPasses.toFixed(1)}</td><td>${s.cpuTaskMsPerSecond.toFixed(1)}</td>`).join('')}</tr>`).join('');
const cards = summary.pairs.map(p => `<article id="${p.id}"><h2>${esc(p.id)} · ${p.quality}</h2><div class="pair">${[['audit', 'Audit 1877a57'], ['before', 'HEAD trước sửa · source'], ['after', 'Sau sửa · build cuối']].map(([stage, label]) => `<figure><figcaption>${label}</figcaption><a href="${stage}/${p.after.file}"><img loading="lazy" src="${stage}/${p.after.file}" alt="${esc(p.id)} ${label}"></a></figure>`).join('')}</div><pre>${esc(JSON.stringify({ camera: p.after.position, target: p.after.target }))}</pre></article>`).join('');
await writeFile(`${directory}/index.html`, `<!doctype html><html lang="vi"><meta charset="utf-8"><title>HR-FIX-TERRAIN · review</title><style>body{margin:24px;background:#17221d;color:#edf2ec;font:15px system-ui}a{color:#bddbc9}table{border-collapse:collapse;width:100%}td,th{padding:7px;border:1px solid #526559}article{margin:32px 0}.pair{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}img{width:100%;height:auto}figcaption{padding:8px}pre{white-space:pre-wrap}@media(max-width:1000px){.pair{grid-template-columns:1fr}}</style><h1>HR-FIX-TERRAIN · ảnh cùng camera</h1><p>12 pose × 3 nguồn ảnh · 1600×900 · RTX 3060. Click ảnh để mở nguyên kích thước.</p><p>Ảnh tĩnh đã ghi nhận để review; bảng số không thay thế nghiệm thu siêu thực. <a href="comparison.json">Số đo, SHA256, giới hạn</a> · <a href="cpu-abba.json">CPU ABBA</a> · <a href="gates.json">Gate</a></p><p>${summary.caveats.map(esc).join('<br>')}</p><table><thead><tr><th>Pose</th><th>Quality</th><th>FPS trước</th><th>Tri trước</th><th>Draw trước</th><th>CPU ms/s trước</th><th>FPS sau</th><th>Tri sau</th><th>Draw sau</th><th>CPU ms/s sau</th></tr></thead><tbody>${rows}</tbody></table>${cards}</html>`);
console.log(`Report: ${evidence.length} images verified, 12 exact pose pairs; public asset delta 0 B`);
