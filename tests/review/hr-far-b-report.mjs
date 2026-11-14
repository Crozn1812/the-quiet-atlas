// Evidence for HR-FAR-B. Never rebuilds or changes runtime files.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = 'test-results/hr-far';
const json = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const names = ['far-landscape', 'far-material', 'far-relief', 'far-shadows', 'far-forest'];
const sources = async () => Object.fromEntries(await Promise.all(names.map(async name => {
  const path = `src/features/world/scene/${name}.ts`, bytes = await readFile(path);
  return [name, { sha256: hash(bytes), bytes: bytes.length, mtimeMs: (await stat(path)).mtimeMs }];
})));
const mode = process.argv[2] ?? 'report';
if (mode === 'seal') {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await writeFile(`${root}/b-build.json`, JSON.stringify({ head, beforeBuild: await sources() }, null, 2));
} else if (mode === 'verify-before') {
  const exportRoot = process.argv[3] ?? 'D:/tqa-worktrees/W-A/out';
  const originalBuild = await json(`${root}/round2-build.json`);
  const id = (await readFile(`${exportRoot}/../.next/BUILD_ID`, 'utf8')).trim();
  assert.equal(id, originalBuild.id);
  const url = process.argv[4] ?? 'http://127.0.0.1:4378/en/';
  const response = await fetch(url); assert.equal(response.status, 200);
  const served = Buffer.from(await response.arrayBuffer());
  assert.equal(hash(served), hash(await readFile(`${exportRoot}/en/index.html`)));
  assert.equal(hash(served), '53df67824ba91f7f461335e6518ccd45b8e38cd927399a196ed466d6f93c03ec');
  await writeFile(`${root}/b-round2-export.json`, JSON.stringify({ id, head: originalBuild.head,
    url, htmlSha256: hash(served), verifiedAt: new Date().toISOString() }, null, 2));
  console.log(`ROUND2 EXPORT VERIFIED: ${id}; original HTML SHA-256 matches`);
} else if (mode === 'verify') {
  const build = await json(`${root}/b-build.json`), after = await sources();
  assert.deepEqual(after, build.beforeBuild, 'Runtime changed after the final seal');
  build.id = (await readFile('.next/BUILD_ID', 'utf8')).trim();
  const builtAt = (await stat('.next/BUILD_ID')).mtimeMs;
  for (const file of Object.values(after)) assert.ok(file.mtimeMs < builtAt);
  const url = process.argv[3] ?? 'http://127.0.0.1:4379/en/';
  const response = await fetch(url); assert.equal(response.status, 200);
  const served = Buffer.from(await response.arrayBuffer());
  assert.equal(hash(served), hash(await readFile('out/en/index.html')));
  build.htmlSha256 = hash(served); build.url = url; build.afterBuild = after;
  build.verifiedAt = new Date().toISOString();
  await writeFile(`${root}/b-build.json`, JSON.stringify(build, null, 2));
  console.log(`EXPORT VERIFIED: ${build.id}; HTTP SHA-256 and all 5 runtime hashes/mtimes match`);
} else if (mode === 'visual') {
  const after = await json(`${root}/b-visual-confirm/metrics.json`);
  const before = await json(`${root}/round2-confirm/metrics.json`);
  const build = await json(`${root}/b-build.json`);
  assert.deepEqual(await sources(), build.afterBuild);
  assert.equal((await readFile('.next/BUILD_ID', 'utf8')).trim(), build.id);
  assert.deepEqual(after.errors, []); assert.deepEqual(after.networkFailures ?? [], []);
  assert.equal(after.failure, undefined); assert.equal(after.samples.length, 4);
  let html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>HR-FAR-B — ảnh xác nhận</title><style>body{background:#18211e;color:#eee;font:16px system-ui;margin:24px}a{color:#bee1d0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;display:block}figure{margin:0}section{margin:32px 0}</style><h1>HR-FAR-B — ảnh trước/sau cùng camera</h1><p>Build ${build.id}. Lint/typecheck/unit/build/e2e PASS. Ảnh/tele kiểm tra WebGL trước và sau đều 0. <strong>FPS còn chờ GPU riêng; chưa PERF PASS.</strong> <a href="b-build.json">Hash build</a> · <a href="b.html">Bảng đo cuối (khi đủ dữ liệu)</a>.</p>`;
  const pair = (title, left, right, caption) => `<section><h2>${title}</h2><div class="pair"><figure><figcaption>${caption}</figcaption><a href="${left}"><img loading="lazy" src="${left}"></a></figure><figure><figcaption>HR-FAR-B / build chốt</figcaption><a href="${right}"><img loading="lazy" src="${right}"></a></figure></div></section>`;
  for (const sample of after.samples) {
    const old = before.samples.find(s => s.zone === sample.zone);
    assert.deepEqual(sample.pose, old.pose); assert.deepEqual(sample.farPose, old.farPose);
    assert.equal(sample.quality, 'high'); assert.equal(sample.glBeforeTele, 0); assert.equal(sample.glError, 0);
    assert.equal(sample.farTele.fov, 20);
    html += pair(`${sample.zone} — High far`, `round2-confirm/1600x900-high-${sample.zone}-far.png`, `b-visual-confirm/1600x900-high-${sample.zone}-far.png`, 'round2-confirm / ảnh gốc');
    html += pair(`${sample.zone} — tele 20°`, `b-round2-recheck/1600x900-high-${sample.zone}-tele20.png`, `b-visual-confirm/1600x900-high-${sample.zone}-tele20.png`, 'Export vòng 2 / chụp bổ sung');
  }
  html += pair('Dãy xa nhất — tele 20°', 'round2-confirm/1600x900-high-farthest-tele20.png', 'b-visual-confirm/1600x900-high-farthest-tele20.png', 'round2-confirm / ảnh gốc');
  html += pair('Horizon — Low', 'round2-confirm/1600x900-low-horizon.png', 'b-ingame-low/horizon.png', 'Vòng 2 / Low');
  await writeFile(`${root}/b-visual.html`, html + '</html>');
  console.log('VISUAL: 4 matched far + 4 tele20 + farthest tele + Low; zero page/shader/HTTP/GL errors after; FPS PENDING');
} else {
  const finalFolder = process.env.HR_FAR_FINAL ?? 'b-production';
  const old = await json(`${root}/round2-confirm/metrics.json`);
  const before = await json(`${root}/b-round2-recheck/metrics.json`);
  const after = await json(`${root}/${finalFolder}/metrics.json`);
  assert.equal(after.label, finalFolder);
  const low = await json(`${root}/b-low/metrics.json`);
  const build = await json(`${root}/b-build.json`);
  const beforeBuild = await json(`${root}/b-round2-export.json`);
  const cpu = await json(`${root}/b-cpu-abba.json`);
  const ingame = await json(`${root}/b-ingame-high/poses.json`);
  const ingameLow = await json(`${root}/b-ingame-low/poses.json`);
  assert.deepEqual(await sources(), build.afterBuild);
  assert.equal((await readFile('.next/BUILD_ID', 'utf8')).trim(), build.id);
  const zones = ['workshop', 'old-trail', 'horizon', 'milestones'];
  const row = (report, zone) => report.samples.find(s => s.zone === zone && s.quality === 'high');
  const n = (v, d = 2) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  for (const report of [before, after, low]) {
    assert.deepEqual(report.errors, []); assert.deepEqual(report.networkFailures ?? [], []);
    assert.equal(report.failure, undefined);
    assert.match(report.gpu, /RTX 3060/);
  }
  assert.equal(after.samples.length, 4); assert.equal(before.samples.length, 4);
  assert.ok(Number.isFinite(after.controlsReadyMs));
  assert.ok(after.worldReadyMs >= after.controlsReadyMs);
  for (const sample of [...after.samples, ...low.samples]) {
    assert.equal(sample.glError, 0); assert.equal(sample.glBeforeTele, 0);
  }
  for (const zone of zones) {
    const a = row(before, zone), b = row(after, zone), original = row(old, zone);
    for (const key of ['pose', 'farPose']) {
      assert.deepEqual(a[key], original[key]); assert.deepEqual(b[key], original[key]);
    }
    assert.deepEqual(a.farTele, b.farTele); assert.equal(b.farTele.fov, 20);
    for (const sample of [a, b]) for (const window of [sample.native, sample.farNative]) {
      assert.ok(window.seconds >= 10);
      for (const state of [window.startState, window.endState]) {
        assert.deepEqual(state, { visibility: 'visible', focused: true, paused: 'false', contextLost: false });
      }
    }
    for (const folder of ['round2-confirm', 'b-round2-recheck', finalFolder]) {
      for (const suffix of folder === 'round2-confirm' ? ['far'] : ['far', 'tele20']) {
        const png = await readFile(`${root}/${folder}/1600x900-high-${zone}-${suffix}.png`);
        assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
        assert.equal(png.readUInt32BE(16), 1600); assert.equal(png.readUInt32BE(20), 900);
      }
    }
  }
  assert.equal(low.samples.length, 1); assert.equal(low.samples[0].quality, 'low');
  assert.equal(low.samples[0].zone, 'horizon');
  assert.deepEqual(low.samples[0].pose, row(old, 'horizon').pose);
  assert.equal(ingame.length, 8); assert.equal(ingameLow.length, 1);
  for (const p of [...ingame, ...ingameLow]) {
    assert.deepEqual(p.pose, row(old, p.zone)[p.suffix ? 'farPose' : 'pose']);
    assert.equal(p.warmupMs, p.suffix ? 1500 : p.quality === 'high' ? 45000 : 10000);
  }
  const perfPass = after.samples.every(s => s.native.fps >= 60 && s.farNative.fps >= 60);
  const lines = [
    '# HR-FAR-B — kết quả', '', `[Gallery trước/sau](b.html) · Build \`${build.id}\``, '',
    `High ≥60 FPS, cả bốn góc thường và far: **${perfPass ? 'PASS' : 'FAIL'}**.`, '',
    '[Kiểm tra qua tools/review/ingame-shots: High](b-ingame-high/poses.json) · [Low](b-ingame-low/horizon.png). 8 High + 1 Low cùng pose, warmup High 45 s.', '',
    'RTX 3060, Edge hardware, 1600×900, DPR 1. Cửa sổ native 10 s, tháo interception WebGL khi đo FPS; draw/triangle đo ở cửa sổ trước đó. Kiểm tra focus/visibility/pause/context loss cho từng mẫu. Tele 20° cập nhật perspective và inverse projection cùng nhau, không dùng tele đo FPS.', '',
    '| Góc | round2-confirm thường / far FPS | Vòng 2 đo lại thường / far | HR-FAR-B thường / far |',
    '|---|---:|---:|---:|',
    ...zones.map(zone => { const o = row(old, zone), a = row(before, zone), b = row(after, zone);
      return `| ${zone} | ${n(o.native.fps)} / ${n(o.farNative.fps)} | ${n(a.native.fps)} / ${n(a.farNative.fps)} | ${n(b.native.fps)} / ${n(b.farNative.fps)} |`; }), '',
    '| Góc High | Draw vòng 2 → B | Tam giác vòng 2 → B | CPU script / task B (ms/s) |', '|---|---:|---:|---:|',
    ...zones.map(zone => { const a = row(before, zone), b = row(after, zone);
      return `| ${zone} | ${n(a.calls, 0)} → ${n(b.calls, 0)} | ${n(a.triangles, 0)} → ${n(b.triangles, 0)} | ${n(b.native.cpuScriptMs)} / ${n(b.native.cpuTaskMs)} |`; }), '',
    '| Góc far High | Draw | Tam giác | CPU script / task (ms/s) |', '|---|---:|---:|---:|',
    ...after.samples.map(s => `| ${s.zone} | ${n(s.farObserved.calls, 0)} | ${n(s.farObserved.triangles, 0)} | ${n(s.farNative.cpuScriptMs)} / ${n(s.farNative.cpuTaskMs)} |`), '',
    '## CPU ABBA', '',
    'Browser: A bật far; B bỏ draw của far bằng observer, cùng build và chất lượng. Depth blit chuẩn bị cho far vẫn chạy ở cả A/B; đây là ablation draw, không cô lập toàn bộ module. CPU CDP / cadence có observer, không phải GPU timestamp hay phép đo native FPS phía trên.', '',
    '| Mẫu | Bỏ far | FPS observer | CPU script / task ms/s |', '|---|---|---:|---:|',
    ...(after.abba ?? []).map(s => `| ${s.label} | ${s.skipFar} | ${n(s.fps)} | ${n(s.cpuScriptMs)} / ${n(s.cpuTaskMs)} |`), '',
    'Factory Node ABBA: A = HEAD trước HR-FAR, B = HR-FAR-B. Không coi A là vòng 2. Chưa gồm network/giải mã cây deferred.', '',
    '| Mẫu | Wall ms | User ms | System ms | Tam giác nền | Buffer byte |', '|---|---:|---:|---:|---:|---:|',
    ...cpu.samples.map(s => `| ${s.label} | ${n(s.wallMs)} | ${n(s.userMs)} | ${n(s.systemMs)} | ${s.triangles} | ${s.bufferBytes} |`), '',
    '## Phạm vi và giới hạn', '',
    '- Giữ bốn dãy/vai lệch/khe vòng 2; sửa vật liệu, sương theo khoảng cách và khe thấp, kẹp dốc, lưới/clip High. Không sửa terrain, foliage, props, sky, vehicle, post, content hoặc index.',
    '- Nền vòng 2: High 524,288 / Low 131,072 tam giác. B: High 131,072 / Low 32,768; vẫn 1 draw nền. Lưới liên tục 8 m, Low 16 m; Low dùng chung attribute/index buffer, không giải phóng VRAM khi đổi tier.',
    '- High/Balanced có hậu kỳ: thêm 1 GPU depth blit/frame khi backdrop hiện. Kiểm tra che khuất với depth copy, chỉ pixel nền nhìn thấy ghi depth trời để tránh biển trong suốt tạo dải aerial lần hai. Không redraw cảnh/readback; không sửa biển hoặc post. Buffer copy 1600×900: 11,520,000 byte ước tính (RGBA8 chưa dùng + depth32), giữ tới dispose, resize tái sử dụng handle. Low, direct/startup và First Light bị che kín không tạo/copy buffer.',
    '- Không thêm file public hoặc dependency: asset byte mới 0. HR-TREE1 vẫn dùng pool có sẵn, 520 cụm / 3 instanced draws; Low không khởi động tải cụm lá của module này.',
    '- Ảnh Low đổi quality sau Enter World; không dùng lượt đó chứng minh cold-Low network. Cold Low không acquire HR-TREE1 được kiểm tra bằng unit; High → Low giữ lease và depth buffer tới dispose.',
    `- Runtime source: ${Object.values(build.afterBuild).reduce((s, f) => s + f.bytes, 0)} byte; đây là dung lượng source, không phải bundled/gzip transfer.`,
    `- Enter World → build+intro done: vòng 2 đo lại ${before.worldReadyMs} ms; B ${after.worldReadyMs} ms. Đây là cận trên của playable, chưa phải mốc input đầu tiên.`,
    `- B Enter World → public intro-done/controls handed back: ${after.controlsReadyMs} ms (QA skip intro như các lượt trước; không phải phép đo first-input ACK hoặc thời lượng cinematic thực).`,
    '- Ảnh far gốc round2-confirm được giữ nguyên. Tele từng góc là ảnh bổ sung từ export vòng 2 còn nguyên (BUILD_ID và SHA-256 HTML đã đối chiếu), không dựng lại ảnh cũ bằng shader mới.',
    '- Ảnh động không khóa mây/gió/nhân vật. FPS bị giới hạn bởi cadence màn hình; máy dùng chung nên chênh lệch trước/sau không chứng minh speedup có kiểm soát. Không dùng mẫu tốt nhất từng zone.',
    `- Giữ lượt B đầu b-production/: Workshop native 57.62 / far 54.77 FPS, dừng vì review tele gọi lại program GL đã dispose (1282). Đã sửa riêng tool và kiểm tra GL trước/sau tele; runtime không đổi. Snapshot cho thấy Edge GPU khác tiếp tục chạy sau khi browser này đóng. b-production-confirm dừng trước lấy mẫu khi GPU cạnh tranh 62.74%. Bảng cuối dùng nguyên cohort ${finalFolder} đủ bốn zone, không lấy mẫu tốt nhất từng góc; trạng thái tải trước lượt cuối ở b-gpu-before-final.json.`,
    `- Export vòng 2 dựa trên HEAD ${beforeBuild.head}; worktree B dựa trên HEAD ${build.head}. Các thay đổi khác đã có sẵn trong hai mốc khác nhau, vì vậy bảng tổng cảnh không cô lập chi phí của module far.`,
    '- Art cần Lead đối chiếu gallery; không suy từ gate kỹ thuật rằng toàn cảnh đã đạt chuẩn ảnh chụp thật.', '',
  ];
  assert.equal(after.abba?.length, 4);
  await writeFile(`${root}/b-report.md`, lines.join('\n'));
  let html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>HR-FAR-B</title><style>body{background:#18211e;color:#eee;font:16px system-ui;margin:24px}a{color:#bee1d0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;display:block}figure{margin:0}section{margin:32px 0}h2{font-size:22px}</style><h1>HR-FAR-B — trước / sau cùng camera</h1><p>High ≥60 FPS: ${perfPass ? 'PASS' : 'FAIL'}. <a href="b-report.md">Số đo và giới hạn</a>.</p>`;
  const pair = (title, left, right, caption) => `<section><h2>${title}</h2><div class="pair"><figure><figcaption>${caption}</figcaption><a href="${left}"><img loading="lazy" src="${left}"></a></figure><figure><figcaption>HR-FAR-B / export cuối</figcaption><a href="${right}"><img loading="lazy" src="${right}"></a></figure></div></section>`;
  for (const zone of zones) {
    html += pair(`${zone} — High far`, `round2-confirm/1600x900-high-${zone}-far.png`, `${finalFolder}/1600x900-high-${zone}-far.png`, 'round2-confirm / ảnh gốc');
    html += pair(`${zone} — tele 20°`, `b-round2-recheck/1600x900-high-${zone}-tele20.png`, `${finalFolder}/1600x900-high-${zone}-tele20.png`, 'Export vòng 2 / chụp bổ sung cùng pose');
  }
  html += pair('Dãy xa nhất — tele 20° gốc', 'round2-confirm/1600x900-high-farthest-tele20.png', `${finalFolder}/1600x900-high-farthest-tele20.png`, 'round2-confirm / ảnh gốc');
  html += pair('Horizon — Low', 'round2-confirm/1600x900-low-horizon.png', 'b-low/1600x900-low-horizon.png', 'Vòng 2 / Low');
  await writeFile(`${root}/b.html`, html + '</html>');
  console.log(`REPORT: 4 matched High far + 4 tele20 pairs + farthest tele + Low; zero page/shader/HTTP errors; High >=60 FPS: ${perfPass ? 'PASS' : 'FAIL'}`);
  if (!perfPass) process.exitCode = 1;
}
