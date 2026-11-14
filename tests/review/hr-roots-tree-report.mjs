// Run after the single final build, screenshots, ABBA, and world e2e.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const root = 'test-results/hr-roots-tree';
const json = path => readFile(path, 'utf8').then(JSON.parse);
const [manifest, before, after, abba, oldJs] = await Promise.all([
  json('public/world/roots/roots-tree.json'), json(`${root}/before/metrics.json`),
  json(`${root}/after/metrics.json`), json(`${root}/abba.json`), json(`${root}/before-js.json`),
]);
const text = async path => { const b = await readFile(path); return b[0] === 255 && b[1] === 254 ? b.toString('utf16le') : b.toString(); };
const e2e = await text(`${root}/e2e.log`);
for (const name of ['lint', 'typecheck', 'test', 'build', 'e2e', 'licenses', 'bundle']) {
  if (!(await text(`${root}/${name}.log`)).includes('EXIT_CODE=0')) throw Error(`${name} has no successful exit code`);
}
if (!/43 passed/.test(e2e) || /\d+ failed/.test(e2e)) throw Error('World e2e has not passed 43/43');
if (after.errors.length || abba.some(r => r.errors.length)) throw Error('Review errors');
if (JSON.stringify(before.poses) !== JSON.stringify(after.poses)) throw Error('Before/after poses differ');
for (const name of Object.keys(after.poses)) {
  const parts = await Promise.all(['before', 'after'].map(async (label, i) => ({ input: await sharp(`${root}/${label}/${name}-high.png`).resize(800, 450).toBuffer(), left: i * 800, top: 0 })));
  await sharp({ create: { width: 1600, height: 450, channels: 3, background: '#eee8d8' } }).composite(parts).png().toFile(`${root}/compare-${name}-high.png`);
}
const js = { raw: 0, gzip: 0, files: 0 };
for (const file of (await readdir('out', { recursive: true })).filter(f => f.endsWith('.js'))) {
  const b = await readFile(`out/${file}`); js.raw += b.length; js.gzip += gzipSync(b).length; js.files++;
}
const aggregate = (modes, name) => {
  const samples = abba.filter(r => modes.includes(r.mode)).flatMap(r => r.measurements.filter(m => m.name === name));
  return Object.fromEntries(['fps', 'calls', 'triangles', 'cpuTaskMsPerSecond', 'cpuScriptMsPerSecond'].map(key => [key, samples.reduce((s, m) => s + m[key], 0) / samples.length]));
};
const n = number => number.toLocaleString('en-US', { maximumFractionDigits: 2 });
const rows = [];
for (const name of ['five', 'fifteen']) for (const [label, modes] of [['A: chặn GLB mới', ['A1', 'A2']], ['B: cây mới', ['B1', 'B2']], ['Low cold', ['Low-cold']]]) {
  const m = aggregate(modes, name); rows.push(`| ${name} / ${label} | ${n(m.triangles)} | ${n(m.calls)} | ${n(m.cpuTaskMsPerSecond)} | ${n(m.fps)} |`);
}
const treeRequests = after.resources.filter(r => r.url.includes('/world/roots/'));
const summary = { manifest, gpu: after.gpu, js, oldJs, newGeometryBytes: manifest.assets.reduce((s, a) => s + a.bytes, 0),
  newPublicBytes: manifest.assets.reduce((s, a) => s + a.bytes, 0) + (await readFile('public/world/roots/roots-tree.json')).length,
  playableMs: after.playableMs, playableAt: after.playableAt, treeRequests, abba };
await writeFile(`${root}/summary.json`, JSON.stringify(summary, null, 2));
const readme = `HR-ROOTS-TREE — bàn giao. Không commit.

Đã thay cây High/Balanced bằng cây đa/si tự dựng: thân hợp từ tám múi quanh lõi có rãnh xoắn, bốn cấp cành, rễ phụ buông xuống đất, bảy rễ bạnh uốn theo các hướng cũ, dây leo và cụm lá/dương xỉ bám thân. Vỏ dùng Poly Haven pine_bark đã có, normal KTX2 2K; AO bake trong vertex color ở rãnh và chân cây. Lá cắt alpha dùng atlas HR-TREE1 đã có. Lớp rêu cũ được chia thành đảo; khi GLB sẵn sàng, ẩn riêng hình cũ của thân/rễ, giữ phần bảng trong cùng batch. Low dùng hình rẻ cùng màu nâu và xanh đậm, không yêu cầu GLB mới.

File trong diff:

- src/features/world/zones/roots.ts — nối streaming và đổi màu fallback; giữ nguyên site selection, collider, E target và bảng.
- src/features/world/zones/roots-dressing.ts — chỉ lớp rêu của cây; không đổi các dressing site/asset khác.
- src/features/world/zones/roots-tree.ts — deferred loader, quality, LOD hysteresis 26/32 m, mask riêng hình cũ, teardown và lỗi mạng.
- public/world/roots/roots-tree-lod0.glb, roots-tree-lod1.glb, roots-tree.json.
- tools/assets/blender/roots-tree-generate.mjs — tác giả geometry offline bằng code, không cần Blender hay mạng.
- assets/LICENSES.csv — ba dòng mới, không đổi các dòng cũ.
- tests/unit/world/zones/roots-tree.test.ts — lifecycle, LOD, Low/offline, late disposal, transform quantization, shader thay material, delivery/licenses.
- tests/review/hr-roots-tree-review.mjs, hr-roots-tree-abba.mjs, hr-roots-tree-report.mjs — chụp và đo có thể chạy lại.

Không có file ngoài phạm vi. Không sửa index.ts, roots-sign.ts, foliage/**, content, config, dependency, docs, e2e/perf. Không tải file ngoài hoặc lưu trạng thái vào storage/cookie/URL.

Gate:

\`\`\`text
pnpm lint        exit 0 — 0 warning
pnpm typecheck   exit 0
pnpm test        exit 0 — 186 files; 1947 passed, 1 skipped (1948)
pnpm build       exit 0 — đúng một lần, WASM SWC + webpack
pnpm exec playwright test 'world.*\\.spec\\.ts' --workers=2
43 passed — exit 0; default config, 11 world spec, Edge/SwiftShader
\`\`\`

Log: [lint](lint.log), [typecheck](typecheck.log), [unit](test.log), [build](build.log), [world e2e](e2e.log), [licenses](licenses.log), [bundle](bundle.log). Suite có một test birds ABBA skip có điều kiện từ trước. Hai lượt unit mặc định bị timeout do tải máy; lượt cuối dùng VITEST_MAX_WORKERS=2 và pnpm test, không tăng timeout hay đổi assertion. Build chạy sau thay đổi code cuối; ảnh và e2e đều dùng export đó.

| Cây riêng | Tam giác | Draw / color pass | GLB byte |
|---|---:|---:|---:|
${manifest.assets.map(a => `| LOD${a.level} | ${n(a.triangles)} | ${a.drawCalls} | ${n(a.bytes)} |`).join('\n')}

Tổng GLB mới ${n(summary.newGeometryBytes)} B; tổng ba file public mới ${n(summary.newPublicBytes)} B. Ba KTX2 dùng lại từ lib, không thêm byte file texture: 10,908,897 B nếu cache trình duyệt chưa có. JS toàn export ${n(oldJs.raw)} → ${n(js.raw)} B raw, ${n(oldJs.gzip)} → ${n(js.gzip)} B gzip; đây là so sánh hai export, có cả các thay đổi main đã có trước ticket, không coi là delta độc lập của cây.

Đo trên ${after.gpu}, viewport 1600×900, Edge headful. Mở được thế giới sau ${n(after.playableMs)} ms; request GLB bắt đầu tại ${treeRequests.map(r => n(r.startTime)).join(' / ')} ms so với mốc playable ${n(after.playableAt)} ms trên navigation clock. Các số này là quan sát một máy, không phải SLA.

CPU ABBA A1/B1/B2/A2 trên cùng build: A chặn riêng GLB cây mới để giữ fallback mới; B nạp cây. Mỗi mẫu 6 giây sau khi ổn định, hai góc, High được chọn thủ công. Số sau là trung bình hai lượt A hoặc B; Low là fresh context và không có request /world/roots/. Đếm WebGL gồm cả shadow/post passes và toàn cảnh, không phải chỉ cây; FPS đo RAF, CPU là CDP TaskDuration ms/s. Rừng xung quanh có LOD thích nghi nên draw/triangle có thể dao động. [Dữ liệu ABBA](abba.json).

| Góc / biến thể | Tam giác toàn frame | Draw toàn frame | CPU task ms/s | FPS |
|---|---:|---:|---:|---:|
${rows.join('\n')}

Ảnh production trước/sau cùng pose, viewport, High/Low. Chỉ ẩn DOM hint E trong trình review để không che dòng cuối bảng; không sửa pixel hoặc lighting.

- [5 m trước/sau](compare-five-high.png), [High gốc](before/five-high.png), [High mới](after/five-high.png), [Low](after/five-low.png).
- [15 m trước/sau](compare-fifteen-high.png), [High gốc](before/fifteen-high.png), [High mới](after/fifteen-high.png), [Low](after/fifteen-low.png).
- [Toàn cây 35 m trước/sau](compare-full-high.png), [High mới](after/full-high.png), [Low](after/full-low.png).
- [Pose, GPU, request, lỗi](after/metrics.json), [tổng số](summary.json).

Giới hạn: FOV gameplay cố định 55° không chứa toàn bộ cây cao hơn 30 m khi đứng 15 m; ảnh 15 m nhìn thân/cành và phần tán, bổ sung góc 35 m để xem toàn cây. Low giữ silhouette đa giác cũ để rẻ, cùng tông màu. Geometry là cây tự dựng, không phải scan; lá là derivative ảnh forest_floor của HR-TREE1. AO bake ở vertex, không có file AO texture riêng. Rễ phụ là chi tiết trang trí, không thêm collider theo yêu cầu giữ physics. Hai LOD đã nạp được giữ trong RAM tới khi rời khu; chuyển Low ẩn chúng tức thì. Các warning shader photo/KTX loader của hệ thống cũ vẫn có thể xuất hiện; review cuối không có console error hoặc pageerror.

Lead không cần sửa index.ts: createRootsScene đã nằm trong registry. Nếu nối ở host khác, vòng đời tối thiểu (8 dòng):

\`\`\`ts
import { createRootsScene } from "./zones/roots";
const roots = createRootsScene(context);
scene.add(roots.group);
roots.update?.(dt, reducedMotion);
// Khi stream-out:
scene.remove(roots.group);
roots.dispose();
\`\`\`
`;
await writeFile(`${root}/HANDOFF.md`, readme);
console.log(JSON.stringify({ newPublicBytes: summary.newPublicBytes, gpu: after.gpu, playableMs: after.playableMs, errors: after.errors, js }));
