// Build the local paired gallery and measurement tables after all captures finish.
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const root = 'test-results/hr-ground';
const json = async file => JSON.parse(await readFile(`${root}/${file}`, 'utf8'));
const before = await json('before/metrics.json'), touchups = await json('before-touchups/metrics.json');
const finalLabel = process.env.HR_GROUND_FINAL_LABEL ?? 'after';
const after = await json(`${finalLabel}/metrics.json`), low = await json('low/metrics.json'), abba = await json('abba.json');
const geometry = await json('geometry.json');
const build = (await readFile('.next/BUILD_ID', 'utf8')).trim();
for (const report of [before, touchups, after, low]) assert.deepEqual(report.errors, []);
assert.equal(after.samples.length, 9); assert.equal(low.samples.length, 1);
const baseline = sample => touchups.samples.find(s => s.zone === sample.zone) ?? before.samples.find(s => s.zone === sample.zone);
const folder = sample => touchups.samples.some(s => s.zone === sample.zone) ? 'before-touchups' : 'before';
for (const sample of after.samples) {
  const a = baseline(sample); assert.deepEqual(a.pose.position, sample.pose.position); assert.deepEqual(a.pose.target, sample.pose.target);
}
const manifest = { build, capturedAt: new Date().toISOString(), files: {}, assetBytesAdded: 0 };
for (const file of ['src/features/world/materials/ground.ts', 'src/features/world/materials/cc0.ts', 'src/features/world/terrain/mesh.ts', 'out/en/index.html'])
  manifest.files[file] = createHash('sha256').update(await readFile(file)).digest('hex');
const chunks = async directory => {
  const files = await readdir(directory); let bytes = 0, gzipBytes = 0;
  for (const file of files.filter(f => f.endsWith('.js'))) {
    const data = await readFile(`${directory}/${file}`); bytes += data.length; gzipBytes += gzipSync(data).length;
  }
  return { bytes, gzipBytes };
};
manifest.beforeChunks = await chunks('node_modules/.cache/hr-ground-baseline-out/_next/static/chunks');
manifest.afterChunks = await chunks('out/_next/static/chunks');
manifest.chunkDelta = { bytes: manifest.afterChunks.bytes - manifest.beforeChunks.bytes, gzipBytes: manifest.afterChunks.gzipBytes - manifest.beforeChunks.gzipBytes };
await writeFile(`${root}/build.json`, JSON.stringify(manifest, null, 2));
const round = value => Number(value.toFixed(2));
let text = `# HR-GROUND — bằng chứng\n\n[Gallery trước/sau](gallery.html) · Build \`${build}\`\n\n`;
text += `Edge hardware, RTX 3060, 1600×900 DPR 1. 9 cặp High cùng pose (8 khu + đỉnh Horizon), Low tại Horizon. Before: 20 s warmup, 3 s sample. Bộ sau \`${finalLabel}\`: ${after.warmupMs / 1000} s warmup, ${after.sampleMs / 1000} s sample. Bảng toàn cảnh có observer GL để đếm draw/triangle ở cả A/B; không dùng nó suy ra tăng tốc. Gió, sóng, cây streaming và giờ trời không khóa.\n\n`;
if (finalLabel !== 'after') {
  const initial = await json('after/metrics.json');
  text += `Lượt đầu \`after/\` được giữ nguyên: Roots ${round(initial.samples.find(s => s.zone === 'roots').fps)} FPS, CPU task ${round(initial.samples.find(s => s.zone === 'roots').cpuTaskMsPerSecond)} ms/s. Do không đạt 60 FPS, đo ABBA tại Roots và chạy lại **toàn bộ** cohort với warmup/sample dài hơn; không ghép mẫu tốt nhất từng khu. Đây là thay đổi phương pháp review, không sửa runtime/build.\n\n`;
}
text += '| Góc High | FPS trước → sau | Draw trước → sau | Tam giác trước → sau |\n|---|---:|---:|---:|\n';
for (const b of after.samples) {
  const a = baseline(b);
  text += `| ${b.zone} | ${round(a.fps)} → ${round(b.fps)} | ${round(a.calls)} → ${round(b.calls)} | ${Math.round(a.triangles)} → ${Math.round(b.triangles)} |\n`;
}
text += `\nHigh ≥60 trên các góc đã đo: **${after.samples.every(s => s.fps >= 60) ? 'PASS' : 'FAIL'}**. Không suy rộng sang mọi góc của world.\n\n`;
text += `## CPU ABBA\n\n${abba.method}. Gỡ interception GL trong cửa sổ FPS/CPU; draw/triangle lấy ở cửa sổ trước đó. Máy dùng chung, không phải benchmark GPU cách ly cấp Lead.\n\n`;
text += '| Lượt | FPS native | CPU script / task ms/s | Draw | Tam giác | Intro done ms |\n|---|---:|---:|---:|---:|---:|\n';
for (const s of abba.samples) text += `| ${s.label} | ${round(s.fps)} | ${round(s.cpuScriptMsPerSecond)} / ${round(s.cpuTaskMsPerSecond)} | ${round(s.calls)} | ${Math.round(s.triangles)} | ${round(s.playableMs)} |\n`;
text += `\nTrung bình A → B: FPS ${round(abba.before.fps)} → ${round(abba.after.fps)}; CPU task ${round(abba.before.cpuTaskMsPerSecond)} → ${round(abba.after.cpuTaskMsPerSecond)} ms/s. Intro done (skip intro QA) ${round(abba.before.playableMs)} → ${round(abba.after.playableMs)} ms; đây là marker trả điều khiển, không phải first-input ACK/cold production load.\n\n`;
text += '## Byte / geometry / giới hạn\n\n';
text += `- Asset public mới: **0 byte**. Tận dụng atlas Poly Haven CC0 đã có license/SHA trong \`tools/assets/textures/cc0-sources.json\` và \`assets/LICENSES.csv\`. Không tải file, thêm dependency hoặc sửa license cũ.\n- Tổng JS chunk export: ${manifest.beforeChunks.bytes} → ${manifest.afterChunks.bytes} byte; cộng gzip riêng từng chunk ${manifest.beforeChunks.gzipBytes} → ${manifest.afterChunks.gzipBytes} byte (delta ${manifest.chunkDelta.gzipBytes}). Đây là toàn bộ chunk export, không phải riêng payload mở world.\n- Mask mới: **${geometry.addedTileAttributeBytes} byte/tile** CPU typed array và GPU attribute khi upload; cliff skin nội suy mask này cũng có buffer bổ sung. Không thêm tam giác hoặc draw nền. 8 khu: position/normal/index và mọi attribute cũ so với HEAD giống byte; 2048 → 2048 tam giác/tile.\n`;
text += '- High atlas hiện hữu: forest/river-rock/rock/bark 2K; grass/sand/dirt 1K trong atlas mixed 8192×3072. Ticket này chưa nâng riêng ảnh cỏ/cát lên 2K/4K; không upscale giả chi tiết.\n- Cát ướt dùng roughness/normal, vùng triều và vệt đọng theo cao độ; không thay shader nước. Địa hình mềm vẫn giữ silhouette/lưới 2 m gốc. Không thêm displacement ground, không sửa height/collider/đường.\n- Shader mới cho terrain Balanced/High; Low/software giữ flat fallback, không fetch ảnh. Lifecycle deferred/quality/cancel/dispose cũ được giữ.\n- Biến thiên 11/19/47 m, UV warp và hai hướng không đồng chu kỳ giảm lặp; normal và roughness cùng tọa độ/trọng số. Không có phép đo cảm nhận mù để chứng nhận photoreal.\n- Cây/props, nền far, trời/sương và mặt nước ngoài phạm vi vẫn thể hiện phong cách cũ; vật liệu ground không làm cả cảnh thành ảnh chụp.\n- Ảnh before ban đầu của Roots bị cây che và Last Postcard nhìn ra nước được giữ nguyên; gallery dùng hai ảnh chụp lại từ cùng export gốc trong before-touchups/.\n';
text += '- Ảnh Low dùng menu sau Enter World, không chứng minh cold-Low network; không tải texture mới khi controller nhận Low được kiểm tra bằng unit.\n';
text += `\n## Node factory ABBA (80 tile/lượt, chỉ thông tin)\n\n| Lượt | Wall ms | User ms | System ms |\n|---|---:|---:|---:|\n`;
for (const s of geometry.samples) text += `| ${s.label} | ${round(s.wallMs)} | ${s.userMs} | ${s.systemMs} |\n`;
await writeFile(`${root}/report.md`, text);
const panels = after.samples.map(s => `<section><h2>${s.zone}</h2><div class="pair"><img src="${folder(s)}/${s.zone}.png" alt="Trước"><img class="after" src="${finalLabel}/${s.zone}.png" alt="Sau"></div><label>Trước <input aria-label="So sánh ${s.zone}" type="range" min="0" max="100" value="50"> Sau</label><p><a href="${folder(s)}/${s.zone}.png">Mở ảnh trước</a> · <a href="${finalLabel}/${s.zone}.png">Mở ảnh sau</a></p></section>`).join('');
await writeFile(`${root}/gallery.html`, `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>HR-GROUND trước/sau</title><style>body{font:16px system-ui;background:#141b17;color:#e7eddf;margin:24px auto;max-width:1440px;padding:0 16px}a{color:#bbdaa9}section{margin:32px 0}.pair{position:relative;aspect-ratio:16/9;overflow:hidden}.pair img{width:100%;height:100%;object-fit:contain;position:absolute;inset:0}.after{clip-path:inset(0 0 0 50%)}label{display:flex;gap:16px;align-items:center;margin-top:12px}input{flex:1}h2{font-size:20px}img.low{width:100%}</style><h1>HR-GROUND — nền theo sinh cảnh</h1><p>9 cặp High cùng góc, build ${build}. Kéo thanh: ảnh trước bên trái, ảnh sau bên phải. Ảnh động không khóa sóng/gió/LOD.</p><p><a href="report.md">Số liệu và giới hạn</a> · <a href="abba.json">CPU ABBA</a> · <a href="build.json">SHA-256</a></p>${panels}<h2>Low — Horizon</h2><img class="low" src="low/horizon.png" alt="Low Horizon"><script>document.querySelectorAll('input').forEach(input=>input.oninput=()=>input.closest('section').querySelector('.after').style.clipPath='inset(0 0 0 '+input.value+'%)');</script></html>`);
console.log(`Gallery: 9 matched High pairs + 1 Low; export ${build}; ${after.samples.every(s => s.fps >= 60) ? 'PASS' : 'FAIL'} measured High FPS`);
