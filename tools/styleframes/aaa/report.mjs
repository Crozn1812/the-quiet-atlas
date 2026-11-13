import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function summarizeAssetBytes(assets) {
  const sum = predicate => assets.filter(predicate).reduce((total, item) => total + item.bytes, 0);
  const b = sum(item => (item.size === 1024 && item.kind !== 'leaves') || item.kind === 'environment');
  return { A: { High: 0, Low: 0 }, B: { High: b, Low: b }, C: { High: sum(item => item.size === 2048 || item.kind === 'environment'), Low: sum(item => item.size === 1024 || item.kind === 'environment') } };
}

export async function writeShowcase(out, report) {
  const measured = report.rows.length === 18;
  const scenes = ['first-light', 'horizon', 'last-postcard'];
  const fmt = value => value === null ? 'N/A' : value.toFixed(2);
  const table = report.rows.map(r => `| ${r.scene} | ${r.variant} | ${r.quality} | ${r.width}×${r.height} | ${r.calls} | ${r.triangles} | ${fmt(r.gpuMedianMs)} / ${fmt(r.gpuP95Ms)} | ${fmt(r.cpuSubmitMedianMs)} | ${fmt(r.frameMedianMs)} / ${fmt(r.frameP95Ms)} |`).join('\n');
  const images = scenes.map(s => `| ${s} | ![A High](${s}-A-High.png) | ![B High](${s}-B-High.png) | ![C High](${s}-C-High.png) |`).join('\n');
  await writeFile(join(out, 'README.md'), `# GFX-01 — ba hướng ánh sáng (nháp để Lead duyệt)

${report.capturedAt} · Microsoft Edge · ${report.device}

${measured ? 'Đã chụp và đo 18 cấu hình; 12 ảnh bên dưới.' : '**CHƯA ĐỦ ĐIỀU KIỆN XONG.** Phiên sandbox chặn tiến trình/IPC Edge (spawn EPERM / Mojo Access denied). Chưa có ảnh chính thức hay số đo renderer/GPU. Ảnh nháp cũ trong tmp/ không đại diện code hiện tại. Chạy lại capture bên dưới từ terminal có quyền chạy Edge để tạo đủ ảnh và thay bảng trống bằng số đo thật.'}

Chạy \`pnpm exec vite tools/styleframes\`, mở \`http://127.0.0.1:4190/aaa.html\`. Nếu Vite gặp spawn EPERM lúc nạp config, dùng \`pnpm exec vite tools/styleframes --configLoader native\`. Chọn cảnh / hướng / chất lượng bằng UI, H ẩn/hiện bảng. Không ghi URL, cookie hay storage. Chụp lại: \`node tools/styleframes/capture-aaa.mjs\`. Có thể nối Edge đã mở bằng biến \`GFX01_CDP_URL\`.

## 9 khung High · 1600×900

| Cảnh | A · R1 nâng cấp | B · Painterly bán thực | C · Gần thực |
|---|---|---|---|
${measured ? images : scenes.map(s => `| ${s} | Chưa chụp | Chưa chụp | Chưa chụp |`).join('\n')}

## 3 khung Low · 1600×900, hướng B làm mẫu chung

${measured ? scenes.map(s => `![${s} B Low](${s}-B-Low.png)`).join('\n\n') : 'Chưa chụp. Capture lấy B Low cho mỗi cảnh; vẫn đo đủ A/B/C Low.'}

## Chi phí đo trên máy dev

${report.method}

| Cảnh | Hướng | Preset | Pixel nội bộ | Draw calls | Tam giác qua mọi pass | GPU p50 / p95 ms | CPU submit p50 ms | RAF p50 / p95 ms |
|---|---|---|---|---|---|---|---|---|
${measured ? table : '| Chưa đo | — | — | — | N/A | N/A | N/A | N/A | N/A |'}

N/A: extension không khả dụng; CPU submit và RAF không phải thời gian GPU. RAF phụ thuộc vsync và tải máy dùng chung. Các cấu hình đo lần lượt trên cùng một browser/context.

## Asset mới (byte thực, không tính decoder/runtime có sẵn)

| Hướng | High | Low |
|---|---|---|
${Object.entries(report.assetBytes).map(([v, s]) => `| ${v} | ${s.High} | ${s.Low} |`).join('\n')}

B: ground/rock/bark albedo ETC1S + normal UASTC KTX2 1K; HDRI RGBE 512×256. C High: 2K và lá alpha-cutout 2K. C Low: 1K. C thêm lá instanced và DOF nhẹ. Albedo chỉ thêm luma vào pigment PALETTE.

Imagery project-original, script tự sinh và khai báo CC0-1.0 trong assets/LICENSES.csv. Tuân thủ cấm tải file ngoài; không phải ảnh scan từ Poly Haven/ambientCG. Tái sinh: \`node tools/assets/textures/generate-aaa.mjs\`, cần KTX-Software đã có. PNG trung gian ở tmp/.

## Phạm vi và giới hạn

- High: shadow 2048 PCF lọc mềm (r187 thay PCFSoftShadowMap bằng PCFShadowMap), GTAO nửa độ phân giải 8 samples, bloom 0.13, grading nhẹ, mist billboard, rim light. C có DOF và back scatter xấp xỉ cho lá. Sương và leaf card được bỏ khỏi depth/normal override; AO/DOF dùng hình tán đặc làm xấp xỉ.
- Low: 65% chiều rộng/cao (1040×585 tại viewport 1600×900), shadow 1024, giảm cây/cỏ/lá/sương, tắt GTAO/bloom/DOF; giữ grading và IBL B/C.
- Iris Xe: **ước lượng cấu hình**, chưa có phép đo GPU dev hay nghiệm thu T08. Low giảm số pixel xuống 42,25%, cỏ còn khoảng 1/4, cây khoảng 2/3; kỳ vọng rẻ hơn High nhưng chưa đủ dữ liệu khẳng định 30 FPS. C Low có alpha overdraw cần đo thêm.
- Địa hình/bố cục sân khấu dùng chung giữa các hướng, dùng lại geometry procedural R1. Không phải ảnh tuyến world đang chạy; không dùng thư viện GFX-02.
- World/index.ts/package/config/lockfile không sửa. Gate 8 khu/luma ±0.03, world load-budget, CPU main-vs-ticket cần Lead chạy sau tích hợp; bàn dựng chưa ghép vào world.
- Không nối bàn dựng vào index.ts. Lead port thông số sau khi Duy chọn hướng, không import công cụ vào runtime. Ví dụ ≤15 dòng và output kiểm tra ở [handoff](../../../tools/styleframes/aaa/HANDOFF.md).
`);
}

if (process.argv[2] === '--draft') {
  const out = 'docs/showcase/37-aaa';
  await mkdir(out, { recursive: true });
  const assets = JSON.parse(await readFile(new URL('./asset-bytes.json', import.meta.url), 'utf8'));
  await writeShowcase(out, {
    capturedAt: '2026-11-13 · bản nháp, chưa capture', device: 'Chưa đo', rows: [],
    method: 'Chưa chạy được Edge trong sandbox; không suy số GPU từ CPU hoặc RAF.',
    assetBytes: summarizeAssetBytes(assets),
  });
  console.info(`DRAFT: ${out}/README.md; no screenshots or performance measurements claimed.`);
}
