// HEAD source vs single final export. Both use the same stored camera poses.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root='test-results/hr-far';
const json=async f=>JSON.parse((await readFile(`${root}/${f}`,'utf8')).replace(/^\uFEFF/,''));
const before=await json('round2-before/metrics.json'),initial=await json('round2-production/metrics.json');
const confirmation=await json('round2-confirm/metrics.json');
assert.equal(initial.samples.length,8); assert.deepEqual(initial.errors,[]);
assert.equal(confirmation.samples.length,4); assert.deepEqual(confirmation.errors,[]);
assert.ok(confirmation.samples.every(s=>s.quality==='high'));
const after={...initial,errors:[...initial.errors,...confirmation.errors],
  networkFailures:[...(initial.networkFailures??[]),...(confirmation.networkFailures??[])],
  samples:[...confirmation.samples,...initial.samples.filter(s=>s.quality==='low')]};
const cpu=await json('cpu-abba.json'),build=await json('round2-build.json');
const zones=['workshop','old-trail','horizon','milestones'];
for(const run of [before,after]){
  assert.equal(run.samples.length,8); assert.deepEqual(run.errors,[]);
  assert.equal(run.networkFailures?.length??0,0); assert.match(run.gpu,/RTX 3060/);
}
assert.equal(after.runtime,'static export');
assert.equal((await readFile('.next/BUILD_ID','utf8')).trim(),build.id);
assert.deepEqual(build.sourceDuringBuild,build.sourceAfter);
for(const [name,hash] of Object.entries(build.sourceAfter)) assert.equal(createHash('sha256').update(await readFile(`src/features/world/scene/${name}.ts`)).digest('hex'),hash);
const fps=s=>s.native?.fps??s.fps, n=(v,d=0)=>Number(v).toFixed(d);
const lines=['# HR-FAR — vòng 2','',`Build duy nhất: ${build.id}; baseline HEAD: ${build.head}.`,'',
  `GPU: ${after.gpu}; Edge hardware, 1600×900, DPR 1.`,'',
  'Before = HEAD far-landscape qua Vite với index/nội dung hiện tại; after = static export cuối. Không giả danh before là build production cũ. Gió/mây/streaming không khóa thời gian; unit/build có chạy khi chụp before. Warmup before 10 s, final High 45 s / Low 5 s. Profile khi unit/e2e đã dừng. Không dùng chênh FPS như bằng chứng speedup có kiểm soát.','',
  'Lượt production đầu có Workshop dưới 60 FPS; GPU counter ghi hai PID Edge dùng 3D engine đồng thời (round2-gpu-load.json). Giữ nguyên toàn bộ lượt này. Final High là một lượt xác nhận đủ bốn zone, không lấy mẫu tốt nhất từng zone; Low lấy từ lượt production đầu. Cả hai cùng export, không rebuild. Raw ở round2-production/ và round2-confirm/.','',
  'Native FPS = rAF cadence khi đã trả mọi WebGL method về native; draw/triangle từ cửa sổ observer liền trước, không phải GPU timer. CPU script/task là CDP ms/s. Đã kiểm tra focus, visibility, pause và context loss.','',
  '| Zone | Quality | FPS before → after (native High) | Draw before → after | Triangle before → after | CPU script/task after ms/s |',
  '|---|---|---:|---:|---:|---:|'];
for(const b of after.samples){
  const a=before.samples.find(s=>s.zone===b.zone&&s.quality===b.quality); assert.ok(a);
  assert.deepEqual(a.pose,b.pose); assert.deepEqual(a.farPose,b.farPose);
  for(const s of [a,b]) for(const state of [s.startState,s.endState]) assert.deepEqual(state,{visibility:'visible',focused:true});
  lines.push(`| ${b.zone} | ${b.quality} | ${n(fps(a),2)} → ${n(fps(b),2)} | ${n(a.calls)} → ${n(b.calls)} | ${n(a.triangles)} → ${n(b.triangles)} | ${n(b.native?.cpuScriptMs??b.cpuScriptMs,2)} / ${n(b.native?.cpuTaskMs??b.cpuTaskMs,2)} |`);
}
const high=after.samples.filter(s=>s.quality==='high'); assert.equal(high.length,4);
const pass=high.every(s=>s.native&&s.native.fps>=60&&s.farNative&&s.farNative.fps>=60);
const tele=after.samples.find(s=>s.tele)?.tele; assert.equal(tele?.fov,20);
assert.deepEqual(tele,before.samples.find(s=>s.tele)?.tele);
lines.push('',`Yêu cầu High ≥60 FPS ở cả pose thường và far: **${pass?'PASS':'FAIL'}**. Cả bốn pose far ≥60; Milestones thường 52,53 FPS nên chưa đạt toàn bộ yêu cầu (cửa sổ đo ở metrics.json).`,'',
  '| Final High far | FPS native | Draw | Triangle | CPU script/task ms/s |', '|---|---:|---:|---:|---:|',
  ...high.map(s=>`| ${s.zone} | ${n(s.farNative?.fps,2)} | ${n(s.farObserved?.calls)} | ${n(s.farObserved?.triangles)} | ${n(s.farNative?.cpuScriptMs,2)} / ${n(s.farNative?.cpuTaskMs,2)} |`),'',
  '| High | Initial normal/far FPS | Confirmation normal/far FPS |', '|---|---:|---:|',
  ...high.map(s=>{const a=initial.samples.find(a=>a.zone===s.zone&&a.quality==='high');return `| ${s.zone} | ${n(a.native?.fps,2)} / ${n(a.farNative?.fps,2)} | ${n(s.native?.fps,2)} / ${n(s.farNative?.fps,2)} |`;}),'',
  '## CPU dựng factory ABBA','', 'Warm Node construction; chưa gồm async HR-TREE1 fetch/compact, không phải frame CPU. Máy dùng chung; wall time không chứng nhận tốc độ tải.','',
  '| Mẫu | Wall ms | User ms | System ms | Tam giác terrain | Buffer byte |','|---|---:|---:|---:|---:|---:|');
for(const s of cpu.samples) lines.push(`| ${s.label} | ${n(s.wallMs,2)} | ${n(s.userMs,2)} | ${n(s.systemMs,2)} | ${s.triangles} | ${s.bufferBytes} |`);
lines.push('', '## Browser far ablation — Workshop','',
  'Trên cùng export: A có far, B bỏ draw far bằng interceptor. Cửa sổ observer, không đồng nhất với native FPS hoặc GPU timestamp. A1/A2 dao động lớn nên không quy chênh lệch thành chi phí hay speedup có kiểm soát. Không thay runtime/chất lượng.','',
  '| Mẫu | Bỏ far | FPS observer | Draw | Triangle | CPU script/task ms/s |','|---|---|---:|---:|---:|---:|');
assert.equal(confirmation.abba?.length,4);
for(const s of confirmation.abba) lines.push(`| ${s.label} | ${s.skipFar} | ${n(s.fps,2)} | ${n(s.calls)} | ${n(s.triangles)} | ${n(s.cpuScriptMs,2)} / ${n(s.cpuTaskMs,2)} |`);
const sourceSizes=await Promise.all(Object.keys(build.sourceAfter).map(async name=>(await stat(`src/features/world/scene/${name}.ts`)).size));
const sourceBeforeBytes=Number(execFileSync('git',['cat-file','-s','HEAD:src/features/world/scene/far-landscape.ts'],{encoding:'utf8'}));
const sourceAfterBytes=sourceSizes.reduce((a,b)=>a+b,0);
const poolBytes=(await Promise.all(['spreading-crown','umbrella-crown','bamboo-clump'].map(async name=>(await stat(`public/world/lib/hr-tree-${name}-lod1.glb`)).size))).reduce((a,b)=>a+b,0);
lines.push('', '## Tài nguyên và giới hạn','',
  '- Terrain High 524.288 / Low 131.072 tam giác, 1 draw. High 4 m; Low 8 m dùng cùng buffer với index rẻ. Bốn dãy warp/ridged multifractal, vai lệch và tributary/V-valley; shadow horizon ba hướng nắng bake một lần.',
  `- Public asset byte mới: **0**. Runtime source ${sourceBeforeBytes} → ${sourceAfterBytes} byte (+${sourceAfterBytes-sourceBeforeBytes}); không phải bundled/gzip transfer delta. HR-TREE1 LOD1 có sẵn ${poolBytes} byte nếu chưa có pool/cache, cộng shared textures. Request thực ở metrics.json. Không thêm license vì không thêm public file.`,
  '- Giữ 520 cụm lá / 3 instanced draws từ vòng 1, 2.462.124 tam giác. Không đổi foliage/props; không billboard hoặc atlas mới.',
  `- Enter World → intro+dressing done: before ${before.worldReadyMs} ms; export ${after.worldReadyMs} ms. Đây là cận trên của playable, không phải first-input timestamp; source/export khác cơ chế phân phối.`,
  '- Tán dùng các dome Gaussian chồng lấn; đá dùng noise warp, tránh ô Voronoi/sọc strata. High có fill lạnh, nắng ấm và shadow ridge; Low dùng Basic và không tải cụm lá khi bắt đầu Low.',
  '- Haze/grade chung vẫn nén tương phản núi. Tele cho thấy sống/nhánh/sườn nhưng chưa thể chứng nhận đạt chuẩn khó phân biệt ảnh thật. Không sửa post/sky/vách gần để ép art pass; Lead duyệt hình riêng khỏi gate kỹ thuật.',
  '- Tele 20° là lens review qua WebGL perspective và inverse AO/aerial, cập nhật cả uniform cache; metadata ở metrics. Không đổi runtime/index, không dùng tele đo FPS gameplay.'
);
await writeFile(`${root}/round2-report.md`,lines.join('\n')+'\n');
let html=`<!doctype html><meta charset="utf-8"><title>HR-FAR vòng 2</title><style>body{background:#19221f;color:#eee;font:16px system-ui;margin:24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;display:block}section{margin:32px 0}a{color:#c5dfcc}</style><h1>HR-FAR vòng 2</h1><p>Technical High ≥60 FPS: ${pass?'PASS':'FAIL'}. Art: Lead review. <a href="round2-report.md">Số đo và giới hạn</a></p>`;
for(const zone of zones){ const f=`1600x900-high-${zone}-far.png`; html+=`<section><h2>${zone} — High, cùng pose</h2><div class="pair"><div>Before / HEAD<img loading="lazy" src="round2-before/${f}"></div><div>Final export / full confirmation cohort<img loading="lazy" src="round2-confirm/${f}"></div></div><a href="round2-production/${f}">Ảnh lượt production đầu, giữ nguyên</a></section>`; }
for(const [label,f,folder] of [['Dãy xa nhất — tele 20°','1600x900-high-farthest-tele20.png','round2-confirm'],['Horizon — Low','1600x900-low-horizon.png','round2-production']]) html+=`<section><h2>${label}</h2><div class="pair"><div>Before<img loading="lazy" src="round2-before/${f}"></div><div>Final<img loading="lazy" src="${folder}/${f}"></div></div></section>`;
await writeFile(`${root}/round2.html`,html);
console.log(`8 matched poses; tele 20°; zero page/shader/HTTP errors; build hashes match; High >=60 FPS: ${pass?'PASS':'FAIL'}`);
if(!pass) process.exitCode=1;
