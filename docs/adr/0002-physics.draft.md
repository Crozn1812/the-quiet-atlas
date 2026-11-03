# ADR 0002 — Physics collision (draft)

Trạng thái: **Proposed**, 2026-11-03, L2-001 / P01-A. Chưa chốt production.

## Phạm vi và phiên bản

So sánh A: Rapier KinematicCharacterController với B: capsule + raycast tự viết.
Dependency ghim đã có: Rapier compat **0.21.0**, Three **0.187.0**,
@types/three **0.187.0**, R3F **9.8.2** (spike không dùng R3F).
Node **26.13.0**, pnpm **12.16.1**, Vitest **5.1.0**.
Không sửa dependency, không nối route; chỉ import động qua `mountWorld` sau Enter.
Marker `__TQA_WORLD_CHUNK__` được gán dataset khi mount để giữ trong bundle.

Cùng mặt phẳng 30×30 m, một dốc 15° và ba cột hộp; collider tách mesh nhưng
lấy cùng thông số. Capsule r=0,35 m, nửa đoạn trụ=0,55 m. A cấu hình slope limit
45°, autostep cao 0,3 m/rộng tối thiểu 0,2 m, snap 0,25 m, skin 0,01 m.
B ray quét capsule tại ba cao độ, ba độ lệch ngang và năm ray chân; lọc support
theo normal với ngưỡng 45°, snap 0,25 m. B chưa có autostep/slide tổng quát;
ray hữu hạn có thể bỏ sót góc và không tương đương capsule shape cast.

## Khởi tạo và CSP

A chỉ import `rapier.ts` khi chọn Rapier, gọi `await RAPIER.init()` trước tạo world.
Compat nhúng WASM dạng base64 trong JS (xác minh từ package cài local); không cần
fetch file WASM ngoài. Browser CSP phải cho biên dịch WASM bằng
`script-src 'wasm-unsafe-eval'` bên cạnh các nguồn script được Lead cho phép.
Không tự thêm `'unsafe-eval'`. CSP browser thực tế: **NOT RUN**, Lead/L3 kiểm sau
khi tích hợp. B không dùng WASM. Lỗi init được reject để shell chọn fallback HTML.

## Số đo thực

Máy dev theo `PROJECT_STATUS`/Lead: **desktop i5-14400F + RTX 3060 12 GB**, RAM
36 GB; **không phải máy tham chiếu iGPU**. Windows, Node CLI; GPU không tham gia
phép đo này. Truy vấn CIM xác minh CPU/GPU bị Access denied, không coi là xác minh
độc lập. Browser/viewport/DPR/quality: N/A (không render). OS build, chế độ nguồn:
TBD. Không suy ra FPS, time-to-playable hoặc T08 từ số liệu CPU này.

Lệnh tái lập: `node tools/benchmark-physics/index.mjs`, chạy ba process mới.
Bundle ES browser riêng từng controller, Vite library build target es2022,
minify=true, không external dependency, gzip Node mặc định trên `physics.js`.
Đây là collision bundle gồm phần Three được giữ lại, **không phải toàn world**;
không gồm WebGLRenderer, shell, HTTP overhead. Không phải chunk của Next vì
world chưa được nối; Next loại world khỏi các route hiện tại.

| Phương án | Gzip bytes | Init lần 1/2/3 (ms) | Step mean lần 1/2/3 (ms) | Step p95 lần 1/2/3 (ms) |
|---|---:|---|---|---|
| A Rapier KCC | 1.673.991 | 127,741 / 138,886 / 109,677 | 0,01305 / 0,01485 / 0,01272 | 0,0220 / 0,0245 / 0,0216 |
| B capsule + raycast | 28.872 | 7,580 / 5,335 / 5,590 | 0,01242 / 0,01113 / 0,01040 | 0,0191 / 0,0173 / 0,0153 |

Init gồm import bundle đã build, tạo mesh cảnh, init WASM (A), tạo world/controller;
không gồm build/gzip, network hoặc render. Process mới, không cam kết disk cache
nguội. Mỗi lần warm-up 8.400 bước rồi đo 84.000 bước ở dt=1/60, tạo controller
mới mỗi chu kỳ 840 bước ngoài timer. A đo cả KCC và world.step; B đo toàn bộ rays.
Tuyến input cố định qua dốc rồi về cột, mô tả trong README/benchmark. Hai thuật toán
phản hồi khác nhau nên không ép vị trí cuối giống nhau: A (0,002; 0,909; 7,661),
B (~0; 0,910; 7,760). Số đo cho cảnh nhỏ, không suy rộng sang terrain/cây toàn world.

## Đề xuất và điều kiện xem xét lại

Đề xuất **A Rapier KCC**: có shape collision, slope/autostep/snap sẵn, ít thuật toán
tự bảo trì hơn B. Chênh lệch step nhỏ trên máy dev, nhưng gzip tăng khoảng 1,65 MB
là chi phí đáng kể trong ngân sách ≤8 MB bắt đầu chơi; chưa chứng minh gate đó.
B nhẹ hơn nhiều nhưng mới là xấp xỉ ray, thiếu hành vi ở bậc/góc/slide.

Xem lại khi: CSP deployment không cho WASM; trace toàn world vượt 8 MB hoặc cold
load vượt 10 s trên máy tham chiếu; benchmark iGPU hoặc regression terrain cho thấy
KCC không đạt gate. Khi đó trước hết profile, tối ưu payload và collider; nếu chuyển
B cần test shape sweep/cạnh/bậc/dốc gắt/tunneling và tổng chi phí bảo trì. Không nâng
ngưỡng §8 để hợp thức hóa thất bại.

## Xác minh và phần còn mở

- Lần kiểm cuối: `pnpm lint`, `pnpm typecheck`, `pnpm test` (10/10),
  `pnpm build`: đều exit 0. Trước đó test bắt được dốc quay ngược và lint bắt
  tên biến `module` trong benchmark; đã sửa và chạy lại.
- `rg -l --glob '*.js' '__TQA_WORLD_CHUNK__' out`: không có kết quả (rg exit 1
  theo quy ước không match); wrapper kiểm absence exit 0. Không có marker trong
  toàn bộ JS export hiện tại. Đây chưa thay thế browser network trace.
- Unit test không WebGL: reducer typed appMode/pauseReasons, giới hạn bước, cả hai
  controller đứng trên mặt phẳng, lên dốc và bị cột chặn.
- Unmount dọn listener/RAF/ResizeObserver/GPU/world; blur/hidden xóa phím/vận tốc,
  pause nhiều lý do chỉ chạy khi hết lý do. Chưa có browser lifecycle/visual QA.
- NOT RUN: browser CSP, rò GPU qua nhiều mount/unmount, dốc vượt giới hạn,
  autostep thực tế, mép/góc/tunneling, network trace sau Enter.
- T08 **BLOCKED**: máy iGPU tham chiếu TBD. Nối `/en/` thuộc L1, kiểm bundle thuộc
  L3; README có loader mẫu xử lý rời shell trong lúc mount chờ.

## Số đo P01-B — L2-003 (2026-11-04)

Máy ghi nhãn theo ADR 0007: **desktop dGPU RTX 3060**, i5-14400F,
RAM 36 GB; Node 26.13.0, Windows. Đây là CLI CPU/offline, GPU không tham gia;
không phải máy iGPU, không suy ra FPS/T08. OS build/nguồn điện: TBD.

Lệnh thực chạy: `node tools/benchmark-physics/index.mjs` (exit 0).
Cảnh placeholder 60×60 m, 3.721 đỉnh terrain, 7.200 tam giác terrain,
200 collider thân cây cylinder độc lập quality. Mesh và Rapier heightfield
nhận cùng Float32Array theo thứ tự column-major `z + x * 61`.

| Quality | Cây hiển thị | Collider cây | Tam giác terrain + cây | Geometry batches terrain + cây |
|---|---:|---:|---:|---:|
| Low | 80 | 200 | 10.240 | 3 |
| Balanced (mặc định) | 140 | 200 | 12.520 | 3 |
| High | 200 | 200 | 14.800 | 3 |

Các số trên đếm trực tiếp index/vertex và instance count từ geometry sinh bởi
cùng code scene; **không phải draw calls/tam giác renderer thực tế**. Chưa gồm
capsule, frustum culling và shadow passes. Draw calls trình duyệt: **TBD / NOT RUN**;
đã có `debug: true` hiển thị `renderer.info` để Lead đo. Không ghi 3 batches
thành 3 draw calls thực đo. FPS browser: **DEFERRED P01-F** theo ticket.

World library gzip tổng **1.794.104 bytes**: `world.js` 91.772,
shared `scene` 54.373, dynamic Rapier 1.647.276, raycast 683 bytes.
Phương pháp: Vite ES library target es2022, minify, không external dependencies,
gzip Node mặc định từng JS chunk, cộng tất cả chunk (gồm cả hai lựa chọn collision).
Đây là toàn world library offline, không phải riêng controller, không phải network
trace Next hay số bytes chắc chắn tải sau Enter; không khẳng định gate 8 MB.

CPU Rapier trên terrain + 200 collider cây: init **121,8167 ms**, step mean
**0,059849 ms**, p95 **0,090300 ms**; 8.400 warm-up, 84.000 mẫu dt=1/60,
reset controller mỗi 840 bước ngoài timer. Tuyến trung tâm lên/xuống dốc rồi
lệch ngang; không chứng minh va chạm mọi cây. Benchmark mặc định P01-B chỉ chạy
Rapier, số so sánh A/B P01-A phía trên giữ nguyên lịch sử.

Xác minh: `pnpm test` 89/89 (12 files), gồm actual heightfield buffer, ray hit
mesh ↔ collider tại bốn điểm (sai số < 1e-5 m), instance ratios, danh sách collider
thực không đổi theo quality, KCC đứng và lên dốc. Lần test đầu ray đúng đỉnh lưới
trả null; đã đổi ray kiểm tra vào nội bộ ô (0,23; 0,31 m), vẫn kiểm height buffer
ngay tại đỉnh. Chưa kiểm bằng browser: visual bốn hướng, Enter World, GPU leak qua
nhiều mount/unmount, draw calls. Không tuyên bố các mục này PASS.

## P01-C: tham số đã chốt — L2-004 (2026-11-04)

- Controller mặc định: Rapier KCC; raycast vẫn chỉ là spike so sánh, chưa có
  autostep tổng quát và không bảo đảm collider cây độc lập quality như Rapier.
- `WALK_SPEED = 3 m/s`: tốc độ đi bộ chuẩn dùng đo nhịp bản đồ §7.1.
  `RUN_SPEED = 5 m/s`, giữ Shift trái/phải; chuẩn hóa input chéo trước nhân tốc độ.
  Yaw camera tính quanh +Y, yaw 0 nhìn -Z, yaw +90° nhìn -X.
- Capsule giữ bán kính 0,35 m, nửa đoạn trụ 0,55 m; gravity -9,81 m/s²,
  lực bám đất dùng vận tốc Y=-0,1 m/s khi grounded. Skin 0,01 m.
- Slope climb/slide limit **45°**; snap-to-ground 0,25 m;
  autostep cao tối đa 0,3 m, rộng tối thiểu 0,2 m, không step dynamic body.
- Dốc kiểm vượt giới hạn **60°**: hộp 3×0,3×4 m, tâm (-4; 1,65; 0),
  xoay quanh X; mesh và collider lấy chung `steepRamp`. Tiếp cận từ phía +Z.
- Recovery tự động: Y < -10 m hoặc input di chuyển không đạt 0,1 m tiến bộ
  theo XZ trong 3 giây simulation. Điểm an toàn được cập nhật sau 0,5 giây
  grounded liên tục, đứng yên hoặc dịch chuyển ít nhất 0,01 m/bước khi có input;
  không cập nhật khi input bị chặn. Điểm mặc định (0; 0,92; 4).
  Recovery teleport về `sessionProgress.lastSafePosition`, xóa vận tốc/timer,
  giữ secret/zone và pause reasons; chỉ memory, không persistence.
- Fixed 60 Hz, tối đa 5 bước bù/frame giữ nguyên. Blur/hidden xóa input,
  vận tốc và timer ngay trong handler; bước locomotion khi pause cũng reset.
- UI có thể dispatch `CustomEvent("tqa:return-to-path")` trên container;
  listener được gỡ khi unmount. Hợp đồng mount và marker giữ nguyên.
- Headless unit test dùng Rapier thật cho dốc 60°, cột, snap xuống dốc,
  recovery rơi/kẹt và blur/hidden. Đây không thay thế video T03/T04,
  checklist 5 phút/20 thân cây hoặc đo độ trễ browser: **NOT RUN**.
  Không đo benchmark hiệu năng mới trong P01-C; nhãn máy theo ADR 0007.