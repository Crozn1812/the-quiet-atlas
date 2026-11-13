import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export { summarizeAssetBytes } from './aaa/report.mjs';

/** Final capture report, kept beside the capture entry point. */
export async function writeShowcase(out, report) {
  const scenes = ['first-light', 'horizon', 'last-postcard'];
  const ms = value => value === null ? 'N/A' : value.toFixed(2);
  const rows = report.rows.map(r => `| ${r.scene} | ${r.variant} | ${r.quality} | ${r.width}×${r.height} | ${r.calls} | ${r.triangles} | ${ms(r.gpuMedianMs)} / ${ms(r.gpuP95Ms)} | ${ms(r.cpuSubmitMedianMs)} | ${ms(r.frameMedianMs)} / ${ms(r.frameP95Ms)} |`);
  await writeFile(join(out, 'README.md'), `# GFX-01 — ba hướng ánh sáng, bản nháp để Lead/Duy chọn

${report.capturedAt} · Microsoft Edge · ${report.device}

Đã chụp **12 ảnh 1600×900**, đo **18 cấu hình** (3 cảnh × A/B/C × High/Low). Không lỗi JavaScript/HTTP trong capture. Dữ liệu gốc: [results.json](results.json). Đây là bàn dựng Vite độc lập, chưa ghép vào world.

## Chạy lại

Từ root repo, chạy hai terminal (PowerShell dùng \`pnpm.cmd\` nếu \`pnpm.ps1\` bị chặn):

\`pnpm exec vite tools/styleframes --config tools/styleframes/gfx01.vite.config.mjs --configLoader native\`

\`node tools/styleframes/capture-gfx01.mjs\`

Mở \`http://127.0.0.1:4190/aaa.html\`; chọn cảnh/hướng/chất lượng bằng UI, H ẩn/hiện bảng. Trạng thái chỉ ở memory; không ghi URL/storage/cookie. Có thể dùng \`GFX01_BASE_URL\`, hoặc \`GFX01_CDP_URL\` để nối Edge đang mở. Cache riêng nằm trong \`tools/styleframes/.verify-dist/\` đã được ignore. Capture mới lưu cả ảnh, JSON và README cùng thư mục.

## 9 khung High · 1600×900

| Cảnh | A · R1 nâng cấp | B · Painterly bán thực | C · Gần thực (thử nghiệm) |
|---|---|---|---|
${scenes.map(s => `| ${s} | ![${s} A High](${s}-A-High.png) | ![${s} B High](${s}-B-High.png) | ![${s} C High](${s}-C-High.png) |`).join('\n')}

## 3 khung Low · 1600×900

Chọn B Low làm mẫu mỗi cảnh; vẫn đo đủ A/B/C Low trong bảng bên dưới. Render nội bộ 1040×585 rồi trình bày ở 1600×900.

${scenes.map(s => `![${s} B Low](${s}-B-Low.png)`).join('\n\n')}

## Chi phí thật trên máy dev

${report.method}

| Cảnh | Hướng | Preset | Pixel nội bộ | Draw calls | Tam giác qua mọi pass | GPU p50 / p95 ms | CPU submit p50 ms | RAF p50 / p95 ms |
|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}

Draw calls/tam giác lấy từ \`renderer.info\`, reset một lần trước cả khung, gồm shadow và mọi pass hậu kỳ. GPU dùng \`EXT_disjoint_timer_query_webgl2\`; loại mẫu disjoint, không suy GPU từ CPU/RAF. N/A nghĩa là không đủ mẫu GPU hợp lệ hoặc extension không có. CPU submit chỉ đo gửi lệnh. RAF chịu vsync/tải máy dùng chung; không dùng RAF để xếp hạng hướng đồ họa. Mỗi cấu hình đo tuần tự trên cùng browser/context, tối thiểu 120 mẫu CPU và 30 mẫu GPU khi hỗ trợ; đây là lượt khảo sát ngắn, chưa phải benchmark T08.

## Byte asset mới mỗi hướng

| Hướng | High (byte) | Low (byte) |
|---|---|---|
${Object.entries(report.assetBytes).map(([v, s]) => `| ${v} | ${s.High} | ${s.Low} |`).join('\n')}

Đây là tổng byte file thực mỗi cấu hình tải, không cộng decoder/runtime có sẵn, không phải VRAM hay tổng tải toàn trang. B dùng ground/rock/bark albedo ETC1S + normal UASTC KTX2 1K và HDR RGBE 512×256. C High dùng 2K và lá alpha-cutout 2K; C Low dùng 1K. A không cần asset ảnh mới. Manifest kích thước: [asset-bytes.json](../../../tools/styleframes/aaa/asset-bytes.json).

15 asset project-original, tự sinh và dành cho CC0-1.0, mỗi file có dòng trong \`assets/LICENSES.csv\`. Không tải file ngoài, không dùng pixel tham chiếu hay thương hiệu. Tái sinh bằng \`node tools/assets/textures/generate-aaa.mjs\` với KTX-Software sẵn trên máy; PNG trung gian ở \`tmp/\`.

## Cấu hình và giới hạn đã biết

- A High: geometry R1, shadow 2048 PCF lọc mềm (Three r187 dùng PCFShadowMap), GTAO nửa độ phân giải/8 mẫu, bloom 0.13, grading nhẹ, mist billboard và rim light. B thêm PBR/IBL, phản chiếu trời và Fresnel nước. C thêm lá cutout/back scatter xấp xỉ và DOF nhẹ. Sương/lá được bỏ khỏi depth/normal override; AO/DOF dùng tán đặc xấp xỉ.
- Low: 65% mỗi chiều, shadow 1024, giảm cây/cỏ/lá/sương, tắt AO/bloom/DOF; B/C giữ IBL. **Iris Xe chỉ là ước lượng cấu hình**, chưa nghiệm thu 30 FPS/T08. Số RTX 3060 phía trên không thay cho iGPU. Số pixel Low bằng 42,25% High; alpha overdraw của C vẫn cần đo trên máy chuẩn.
- C High cần 12.687.385 byte asset, vượt ngân sách 8 MB đầu vào nếu tải hết ngay; số tam giác qua pass tăng khoảng 49% so với A ở cả ba cảnh. Chỉ dùng để so hướng, cần giảm leaf/pass và tải trì hoãn trước khi xét gate world +25% tam giác. Chưa chứng minh đạt ngân sách sản xuất.
- Đã tự xem ảnh: B/C hiện lộ vân procedural lặp ở mặt đất/vỏ cây; C có leaf card tiền cảnh khá lớn. C vẫn dựa trên tán R1, chưa là cây gần thực hoàn chỉnh. Lead/Duy cần duyệt tỷ lệ lá và độ mạnh normal trước khi port. Three có cảnh báo tham số material undefined dùng giá trị mặc định; capture không có error.
- Cùng bố cục/camera/seed giữa A/B/C mỗi preset; Low giảm mật độ. Không dùng asset GFX-02 và không sửa world. Gate 8 khu/luma ±0,03, world load-budget và CPU so main thuộc bước tích hợp do Lead chạy sau khi chọn hướng.

Danh sách file, output kiểm tra và ví dụ nối vào \`index.ts\` (≤15 dòng) ở [bàn giao](../../../tools/styleframes/HANDOFF-GFX-01.md).
`);
}

if (process.argv[2] === '--report') {
  const out = process.argv[3] ?? 'docs/showcase/37-aaa';
  await writeShowcase(out, JSON.parse(await readFile(join(out, 'results.json'), 'utf8')));
  console.info(`PASS: regenerated ${out}/README.md from measured results.json.`);
}
