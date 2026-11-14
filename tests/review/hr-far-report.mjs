// Final export vs original HEAD and rejected round 1, with identical stored poses.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root='test-results/hr-far';
const read=async name=>JSON.parse(await readFile(`${root}/${name}`,'utf8'));
const before=await read('before/metrics.json'),after=await read('production/metrics.json');
const rejected=await read('return1-before/metrics.json');
const cpu=await read('cpu-abba.json'),build=await read('build.json'),crowns=await read('crowns/resources.json');
const zones=['workshop','old-trail','horizon','milestones'];
const sources=['far-landscape','far-relief','far-material','far-forest'];
for(const run of [before,rejected,after]) {
  assert.equal(run.samples.length,8);assert.equal(run.errors.length,0);
  assert.equal(run.networkFailures?.length??0,0);assert.match(run.gpu,/RTX 3060/);
}
assert.equal(after.runtime,'static export');
assert.equal(await readFile('.next/BUILD_ID','utf8'),build.id);
assert.deepEqual(build.sourceBefore,build.sourceAfter);
for(const n of sources) assert.equal(createHash('sha256').update(await readFile(`src/features/world/scene/${n}.ts`)).digest('hex'),build.sourceAfter[n]);
const fps=s=>s.native?.fps??s.fps;
const lines=['# HR-FAR return 1 measurements','',`Build: ${build.id}; baseline HEAD: ${build.head}`,'',
  `GPU: ${after.gpu}. Edge hardware WebGL, 1600x900, DPR 1.`,'',
  'Before = original HEAD via Vite; rejected = previous export retained in return1-before/; final = new static export. All stored camera poses match. Live wind/clouds/streaming and a shared workstation prevent a controlled speedup claim. High native FPS = active rAF cadence with all GL interceptions restored. Draw/triangle counts use the adjacent observer window; CPU script/task = CDP ms/s. Focus/visibility and native pause/context state checked.','',
  '| Zone | Quality | Original / rejected / final FPS | Observer FPS original / final | Draw original / final | Triangle original / final | CPU final script/task ms/s |',
  '|---|---|---:|---:|---:|---:|---:|'];
for(const b of after.samples) {
  const a=before.samples.find(s=>s.zone===b.zone&&s.quality===b.quality),r=rejected.samples.find(s=>s.zone===b.zone&&s.quality===b.quality);
  for(const old of [a,r]) {assert.deepEqual(b.pose,old.pose);assert.deepEqual(b.farPose,old.farPose);}
  for(const s of [a,r,b]) {
    assert.ok(s.frames>0&&Number.isFinite(s.fps));
    for(const state of [s.startState,s.endState,s.native?.startState,s.native?.endState].filter(Boolean)) {
      assert.ok(state.focused&&state.visibility==='visible');
      if('paused' in state)assert.ok(state.paused==='false'&&!state.contextLost);
    }
  }
  const bc=b.native??b;
  lines.push(`| ${b.zone} | ${b.quality} | ${fps(a).toFixed(2)} / ${fps(r).toFixed(2)} / ${fps(b).toFixed(2)} | ${a.fps.toFixed(2)} / ${b.fps.toFixed(2)} | ${a.calls.toFixed(1)} / ${b.calls.toFixed(1)} | ${Math.round(a.triangles).toLocaleString('en')} / ${Math.round(b.triangles).toLocaleString('en')} | ${bc.cpuScriptMs.toFixed(1)}/${bc.cpuTaskMs.toFixed(1)} |`);
}
const high=after.samples.filter(s=>s.quality==='high');assert.deepEqual(high.map(s=>s.zone),zones);
const pass=high.every(s=>fps(s)>=60);
lines.push('',`Final High >=60 FPS: ${pass?'PASS':'FAIL'}. Applies to these recorded windows. Art: Lead review.`,'',
  '| Construction ABBA | Wall ms | User/system ms | Terrain triangles | Geometry bytes | Crown sites |','|---|---:|---:|---:|---:|---:|');
for(const s of cpu.samples)lines.push(`| ${s.label} | ${s.wallMs.toFixed(2)} | ${s.userMs}/${s.systemMs} | ${s.triangles} | ${s.bufferBytes} | ${s.sites} |`);
lines.push('','ABBA is warmed Node factory CPU, separate from frame CPU. Deferred crown loading/compaction is outside the factory timer.','',
  '| Final 3D crown batch | Sites | Triangles/site | Total triangles | Owned geometry + instance bytes |','|---|---:|---:|---:|---:|');
let forestTriangles=0,forestBytes=0;
const species=cpu.samples.find(s=>s.label==='B1').species;
for(const c of crowns) {
  const count=species[c.name.replace('far-','')];assert.ok(count);
  const bytes=c.geometryBytes-20+count*84;forestBytes+=bytes;forestTriangles+=count*c.triangles;
  lines.push(`| ${c.name} | ${count} | ${c.triangles} | ${count*c.triangles} | ${bytes} |`);
}
const beforeBytes=Buffer.byteLength(execFileSync('git',['show','HEAD:src/features/world/scene/far-landscape.ts'],{encoding:'utf8'}));
const afterBytes=(await Promise.all(sources.map(async n=>Buffer.byteLength(await readFile(`src/features/world/scene/${n}.ts`,'utf8'))))).reduce((a,b)=>a+b,0);
const lodBytes=(await Promise.all(['spreading-crown','umbrella-crown','bamboo-clump'].map(async n=>(await stat(`public/world/lib/hr-tree-${n}-lod1.glb`)).size))).reduce((a,b)=>a+b,0);
lines.push('',`Final forest: ${forestTriangles} triangles / ${crowns.length} draws; owned buffers ${forestBytes} bytes, excluding renderer pool textures. Terrain: High 204800 / Low 51200 triangles, one draw.`,'',
  `Public asset bytes added: 0. Existing HR-TREE1 LOD1 GLBs: ${lodBytes} bytes if absent from pool/cache, plus existing shared textures. HR-FAR no longer requests atlases. No new licenses. Actual matching requests: production/metrics.json.`,'',
  `Runtime source bytes: ${beforeBytes} -> ${afterBytes} (+${afterBytes-beforeBytes}); not compressed transfer delta. No second baseline build.`,'',
  `Enter World -> intro+dressing done: ${before.worldReadyMs} ms source baseline -> ${after.worldReadyMs} ms production. Upper bounds on playable, not first-input timestamps; delivery paths differ.`,'',
  'Low hides crown batches and uses the cheap index/material. Cold Low never requests them (unit gate). High -> Low retains leases until dispose, not full VRAM release. Original/final warmup differs (8 s vs 45 s High), affecting unrelated streamed geometry. Verification tests ran concurrently during part of the production capture; observer overhead and workstation load are recorded, never treated as a controlled speedup. Nearby terrain, foliage, sky and post remain outside this patch.');
await writeFile(`${root}/report.md`,lines.join('\n')+'\n');
let html=`<!doctype html><meta charset="utf-8"><title>HR-FAR return 1</title><style>body{background:#19221f;color:#eee;font:16px system-ui;margin:24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;display:block}section{margin:32px 0}a{color:#c5dfcc}</style><h1>HR-FAR return 1</h1><p>High >=60 FPS: ${pass?'PASS':'FAIL'}. Build ${build.id}. <a href="report.md">Measurements and limitations</a>. Art: Lead review.</p><p>Additional captures via tools/review/ingame-shots.mjs: <a href="ingame-high/poses.json">matched High poses</a>, <a href="ingame-high/horizon-far.png">High Horizon</a>, <a href="ingame-low/horizon.png">Low Horizon</a>.</p>`;
for(const zone of zones)for(const suffix of ['','-far']) {
  const file=`1600x900-high-${zone}${suffix}.png`;
  html+=`<section><h2>${zone}${suffix} / High</h2><div class="pair"><div>Rejected round 1<img loading="lazy" src="return1-before/${file}"></div><div>Final<img loading="lazy" src="production/${file}"></div><div>Original HEAD<img loading="lazy" src="before/${file}"></div></div></section>`;
}
html+='<section><h2>Horizon / Low</h2><div class="pair"><div>Original<img src="before/1600x900-low-horizon.png"></div><div>Final<img src="production/1600x900-low-horizon.png"></div></div></section>';
await writeFile(`${root}/index.html`,html);
console.log(`Samples 8; three-way matched poses; zero errors; runtime hashes match; High >=60 FPS: ${pass?'PASS':'FAIL'}`);
if(!pass)process.exitCode=1;
