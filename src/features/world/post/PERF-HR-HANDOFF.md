# PERF-HR — bàn giao

Trạng thái cuối: **PASS** ba gate (lint 0 warning, typecheck exit 0, unit 183 file / 1.918 test pass + 1 skip, exit 0). Bộ đối chiếu source và kiểm chứng production đều đủ 24 mẫu, High/balanced (legacy) 900p ≥60 FPS, Low giữ nguyên draw/tam giác. Lượt gameplay cuối có xác nhận focus/visibility đạt **97,51–100,02 FPS** ở bốn khu High 900p. Build WASM/webpack đúng một lần; e2e world `--workers=2` **43/43**. Không commit; không cần nối thêm `index.ts`.

Giới hạn: workstation dùng chung; không khẳng định đã cô lập mọi tải bên ngoài hoặc đo speedup có kiểm soát. Lượt gameplay đầu 38–50 FPS và một timeout unit đã được giữ lại, kèm chẩn đoán và các lượt chạy lại thành công ở dưới.

## Thay đổi

- `foliage/hr-runtime.ts`: gộp batch cùng kiến trúc/LOD qua các source variant trong mỗi binding; giữ fit, tint, pha gió và fade riêng từng instance. Giữ khoảng cách LOD cây, impostor và chính sách bóng hiện có.
- `fauna/birds.ts`: LOD hình học cho đàn xa với hysteresis (High: ra 48 m/vào 40 m; balanced (legacy): ra 40 m/vào 32 m), đo tới con gần nhất; frustum cull có bounds mở rộng cho cánh. Low giữ geometry, số chim và chính sách cull cũ.
- `water/streambed.ts`, `water/streambed-cull.ts`, `post/runtime.ts`: compact từng viên đá theo frustum trước khi Three upload buffer; giữ đồng bộ matrix/color/bedWet, full bounds và thứ tự nguồn khi về Low. Cây thủy sinh/lá trôi không bị cull theo bounds tĩnh.
- `zones/first-light-cliff-detail.ts`, `zones/first-light-cliff-cull.ts`: chia index của vách/fern thành ô 16 m theo world scale để cull riêng ở pass màu/bóng; chia sẻ nguyên attribute, normal, texture và toàn bộ tam giác.
- Test: `tests/unit/world/{birds,hr-tree-runtime,streambed-cull,first-light-cliff-cull}.test.ts`.
- Công cụ/bằng chứng: `tests/review/perf-hr.mjs`, `tests/review/perf-hr-report.mjs`.

Tất cả file trong phạm vi ticket. Không đổi asset nguồn, dependency, content, config, package/lock hoặc index. Không commit.

Danh sách đầy đủ (đường dẫn từ repo):

```text
src/features/world/fauna/birds.ts
src/features/world/foliage/hr-runtime.ts
src/features/world/post/runtime.ts
src/features/world/post/PERF-HR-HANDOFF.md
src/features/world/water/streambed.ts
src/features/world/water/streambed-cull.ts
src/features/world/zones/first-light-cliff-detail.ts
src/features/world/zones/first-light-cliff-cull.ts
tests/unit/world/birds.test.ts
tests/unit/world/hr-tree-runtime.test.ts
tests/unit/world/streambed-cull.test.ts
tests/unit/world/first-light-cliff-cull.test.ts
tests/review/perf-hr.mjs
tests/review/perf-hr-report.mjs
```

## Phương pháp đo

Edge local, hardware WebGL, deviceScaleFactor=1, 1600×900 và 1920×1080; tên GPU lấy từ WEBGL_debug_renderer_info. Một browser do phiên này tạo chạy tuần tự; không chạy test/build/e2e đồng thời với đo GPU. Máy dùng chung: không dừng tiến trình ngoài phiên này, không bảo đảm desktop/GPU toàn máy hoàn toàn cô lập.

Trước sửa quét bốn hướng camera ở khoảng cách 9 m tại mỗi khu, chọn hướng có FPS thấp nhất trong lượt quét. Pose được lưu trong JSON và tái dùng nguyên vẹn cho mọi quality, độ phân giải và lượt sau. Đây là bốn góc được chọn từ phép quét, không chứng minh cực tiểu toàn không gian camera. Source warm-up High/balanced (legacy) 18 s sau khi đặt pose, Low 2,5 s; lấy mẫu tiếp 5 s. Production tăng warm-up High lên 45 s, balanced (legacy) 25 s, Low 5 s để cảnh hội tụ; mỗi mẫu vẫn 5 s. FPS đếm frame có draw / thời gian thực của cửa sổ mẫu. Đếm draw/triangle tại WebGL cho toàn bộ color/shadow/post; source harness gắn tên đối tượng qua Vite transform của Three, không sửa node_modules. Production phân loại pass theo shader/projection.

Raw JSON và ảnh: `test-results/perf-hr/{before,after,production}/`. Report cùng thư mục. Source harness dùng mountWorld trực tiếp, production đi qua Enter World; nhãn được tách rõ. Không dùng số 19,38 FPS lịch sử làm đối chứng để tính speedup. Wind/chim/streaming sống và warm cache có thể làm khác pixel/FPS; các thay đổi cull giữ geometry còn trong khung hình.

### Profile trước sửa: High 1600×900

| Khu | HR trees: draw / triangle | Chim: draw / triangle | Streambed: draw / triangle | Vách/fern: draw / triangle |
|---|---:|---:|---:|---:|
| First Light | 117 / 2.683.346 | 5 / 568.008 | 20 / 170.912 | 4 / 563.056 |
| Roots | 126 / 2.703.628 | 3 / 730.296 | 75 / 627.770 | 2 / 281.528 |
| Workshop | 140 / 2.644.880 | 4 / 757.344 | 45 / 383.022 | 4 / 563.056 |
| Quiet Shore | 0 / 0 | 3 / 622.104 | 35 / 229.152 | 0 / 0 |

Số trên cộng color + shadow, chưa gồm props/terrain/ground khác. Post High là 21 fullscreen draw / 21 triangle mỗi frame. Cây/sỏi/cỏ/chim đã instanced trước ticket; chim xa vẫn dùng ~27.048 triangle/con, và frustum cull chim bị tắt. Log có cây `lod2` thực sự được vẽ; impostor không cast realtime shadow. HR chỉ cast shadow ở LOD0. Mảng vách/fern gộp có bounds rộng khiến camera bóng ở Roots gửi cả 281.528 triangle dù phần vách thật nằm ngoài camera bóng. Sau partition, vách không còn được gửi ở pose Roots; geometry/texture gốc không đổi. Khoảng cách cây High 22/66 m và hysteresis được giữ, không hạ preset hoặc độ phân giải hậu kỳ.

## Kết quả và lệnh

Đối chiếu source: **PASS** 24 mẫu, High/balanced (legacy) 1600×900 ≥60 FPS; Low giữ nguyên draw/triangle ở cả tám mẫu. Không quy phần tăng/giảm FPS thành speedup có kiểm soát trên workstation dùng chung.

```text
pnpm.cmd lint: exit 0, 0 warning
pnpm.cmd typecheck: exit 0
VITEST_MAX_WORKERS=2 pnpm.cmd test:
  Test Files 183 passed (183)
       Tests 1918 passed | 1 skipped (1919)
  Duration 227.76s; exit 0
NEXT_TEST_WASM_DIR=C:\Users\PC-LP\AppData\Local\next-swc\wasm\package NEXT_BUILD_WEBPACK=1 pnpm.cmd build: exit 0 (chỉ một lần)
pnpm.cmd exec playwright test world --workers=2:
  43 passed (4.8m); exit 0
```

Log: `tmp/perf-hr-{lint,typecheck,test,build,e2e,before,after,production}.log`. Build dùng webpack + WASM SWC; không sửa runtime sau build. Một test ABBA fauna tùy chọn không bật nên được skip.

Tiếp tục ngày 2026-11-14: giữ nguyên runtime, build và kết quả e2e của phiên trước; hoàn thiện kiểm chứng production, đối chiếu đủ ảnh và siết kiểm tra dữ liệu trong report. Lint chạy lại exit 0, 0 warning; typecheck chạy lại exit 0. Lượt unit test đầu của phiên tiếp tục (`VITEST_MAX_WORKERS=2`) có 182 file pass, 1 file fail: 1.917 test pass, 1 skip, 1 timeout. Ca `secrets-wiring.test.ts:376` mount → dispose → remount vượt timeout 15.000 ms (16.170 ms); không ghi nhận assertion fail. Log gốc giữ tại `tmp/perf-hr-resume-test.log`. Chạy lại toàn bộ suite với một worker, giữ nguyên code và timeout.

Gate cuối phiên tiếp tục:

```text
pnpm.cmd lint: exit 0, 0 warning
pnpm.cmd typecheck: exit 0
VITEST_MAX_WORKERS=1 pnpm.cmd test:
  Test Files 183 passed (183)
       Tests 1918 passed | 1 skipped (1919)
  Duration 626.19s; exit 0
node tests/review/perf-hr-report.mjs after:
  Samples 24; 1600×900 High/balanced (legacy) ≥60 FPS: PASS; Low counts unchanged: PASS; exit 0
node tests/review/perf-hr-report.mjs production:
  Samples 24; 1600×900 High/balanced (legacy) ≥60 FPS: PASS; Low counts unchanged: PASS; exit 0
git diff --check: exit 0
```

Log gate mới: `tmp/perf-hr-resume-{lint,typecheck,test-serial}.log`. Không build lại: runtime cuối cùng có mtime trước `.next/BUILD_ID` (18:33:56 ngày 2026-11-14), và phiên tiếp tục chỉ sửa công cụ review cùng bàn giao. Build WASM/webpack duy nhất và e2e world 43/43 phía trên vẫn kiểm tra đúng runtime hiện tại.

### Trước/sau source, gồm mọi pass

| Size | Zone | Quality | FPS before → after | Draws before → after | Triangles before → after | Before passes: draws / triangles | After passes: draws / triangles |
|---|---|---|---:|---:|---:|---|---|
| 1600×900 | first-light | high | 93.98 → 99.52 | 222.0 → 196.0 | 4,315,862 → 3,322,026 | color: 187.0 / 3,458,765; shadow: 14.0 / 857,076; post: 21.0 / 21 | color: 144.0 / 2,517,189; shadow: 31.0 / 804,816; post: 21.0 / 21 |
| 1600×900 | roots | high | 42.28 → 90.07 | 390.0 → 320.0 | 4,735,234 → 3,349,618 | color: 350.0 / 4,423,443; shadow: 19.0 / 311,770; post: 21.0 / 21 | color: 282.0 / 3,319,785; shadow: 17.0 / 29,812; post: 21.0 / 21 |
| 1600×900 | workshop | high | 68.69 → 100.24 | 293.0 → 314.7 | 4,700,387 → 4,172,851 | color: 259.0 / 4,377,766; shadow: 13.0 / 322,600; post: 21.0 / 21 | color: 267.7 / 4,024,046; shadow: 26.0 / 148,784; post: 21.0 / 21 |
| 1600×900 | quiet-shore | high | 100.00 → 99.98 | 121.0 → 119.0 | 1,160,994 → 687,952 | color: 82.0 / 1,145,047; shadow: 18.0 / 15,926; post: 21.0 / 21 | color: 80.0 / 672,005; shadow: 18.0 / 15,926; post: 21.0 / 21 |
| 1600×900 | first-light | balanced | 100.00 → 100.10 | 179.0 → 172.0 | 2,243,533 → 1,488,291 | color: 153.0 / 2,127,924; shadow: 6.0 / 115,589; post: 20.0 / 20 | color: 125.0 / 1,393,023; shadow: 27.0 / 95,248; post: 20.0 / 20 |
| 1600×900 | roots | balanced | 97.19 → 99.96 | 312.0 → 269.0 | 2,940,288 → 1,975,655 | color: 273.0 / 2,818,919; shadow: 19.0 / 121,349; post: 20.0 / 20 | color: 232.0 / 1,945,393; shadow: 17.0 / 30,242; post: 20.0 / 20 |
| 1600×900 | workshop | balanced | 100.00 → 99.94 | 224.0 → 252.6 | 2,680,426 → 1,999,678 | color: 191.0 / 2,544,733; shadow: 13.0 / 135,673; post: 20.0 / 20 | color: 205.6 / 1,917,737; shadow: 27.0 / 81,921; post: 20.0 / 20 |
| 1600×900 | quiet-shore | balanced | 100.22 → 85.67 | 119.0 → 117.0 | 1,048,409 → 589,425 | color: 81.0 / 1,032,463; shadow: 18.0 / 15,926; post: 20.0 / 20 | color: 79.0 / 573,479; shadow: 18.0 / 15,926; post: 20.0 / 20 |
| 1600×900 | first-light | low | 100.06 → 93.92 | 67.0 → 67.0 | 297,338 → 297,338 | color: 67.0 / 297,338; shadow: 0.0 / 0; post: 0.0 / 0 | color: 67.0 / 297,338; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1600×900 | roots | low | 100.10 → 83.35 | 112.0 → 112.0 | 341,380 → 341,380 | color: 112.0 / 341,380; shadow: 0.0 / 0; post: 0.0 / 0 | color: 112.0 / 341,380; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1600×900 | workshop | low | 99.98 → 87.76 | 84.0 → 84.0 | 309,120 → 309,120 | color: 84.0 / 309,120; shadow: 0.0 / 0; post: 0.0 / 0 | color: 84.0 / 309,120; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1600×900 | quiet-shore | low | 99.94 → 94.16 | 62.0 → 62.0 | 278,012 → 278,012 | color: 62.0 / 278,012; shadow: 0.0 / 0; post: 0.0 / 0 | color: 62.0 / 278,012; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1920×1080 | first-light | high | 100.12 → 82.31 | 222.0 → 196.0 | 4,315,862 → 3,322,026 | color: 187.0 / 3,458,765; shadow: 14.0 / 857,076; post: 21.0 / 21 | color: 144.0 / 2,517,189; shadow: 31.0 / 804,816; post: 21.0 / 21 |
| 1920×1080 | roots | high | 100.08 → 73.92 | 380.0 → 319.7 | 4,602,264 → 3,337,743 | color: 340.0 / 4,290,473; shadow: 19.0 / 311,770; post: 21.0 / 21 | color: 281.7 / 3,307,480; shadow: 17.0 / 30,242; post: 21.0 / 21 |
| 1920×1080 | workshop | high | 70.25 → 69.48 | 298.0 → 314.0 | 4,784,037 → 4,003,127 | color: 264.0 / 4,461,416; shadow: 13.0 / 322,600; post: 21.0 / 21 | color: 267.0 / 3,854,322; shadow: 26.0 / 148,784; post: 21.0 / 21 |
| 1920×1080 | quiet-shore | high | 100.02 → 99.58 | 121.0 → 119.0 | 1,160,994 → 687,952 | color: 82.0 / 1,145,047; shadow: 18.0 / 15,926; post: 21.0 / 21 | color: 80.0 / 672,005; shadow: 18.0 / 15,926; post: 21.0 / 21 |
| 1920×1080 | first-light | balanced | 100.00 → 68.32 | 179.0 → 172.0 | 2,243,533 → 1,488,291 | color: 153.0 / 2,127,924; shadow: 6.0 / 115,589; post: 20.0 / 20 | color: 125.0 / 1,393,023; shadow: 27.0 / 95,248; post: 20.0 / 20 |
| 1920×1080 | roots | balanced | 100.02 → 69.61 | 312.0 → 268.0 | 2,943,782 → 1,854,785 | color: 273.0 / 2,818,919; shadow: 19.0 / 124,843; post: 20.0 / 20 | color: 231.0 / 1,824,523; shadow: 17.0 / 30,242; post: 20.0 / 20 |
| 1920×1080 | workshop | balanced | 100.00 → 79.86 | 224.0 → 252.0 | 2,680,426 → 1,858,769 | color: 191.0 / 2,544,733; shadow: 13.0 / 135,673; post: 20.0 / 20 | color: 205.0 / 1,776,828; shadow: 27.0 / 81,921; post: 20.0 / 20 |
| 1920×1080 | quiet-shore | balanced | 99.96 → 99.84 | 119.0 → 117.0 | 1,048,409 → 589,425 | color: 81.0 / 1,032,463; shadow: 18.0 / 15,926; post: 20.0 / 20 | color: 79.0 / 573,479; shadow: 18.0 / 15,926; post: 20.0 / 20 |
| 1920×1080 | first-light | low | 99.88 → 99.94 | 67.0 → 67.0 | 297,338 → 297,338 | color: 67.0 / 297,338; shadow: 0.0 / 0; post: 0.0 / 0 | color: 67.0 / 297,338; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1920×1080 | roots | low | 100.04 → 99.98 | 112.0 → 112.0 | 341,380 → 341,380 | color: 112.0 / 341,380; shadow: 0.0 / 0; post: 0.0 / 0 | color: 112.0 / 341,380; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1920×1080 | workshop | low | 100.08 → 100.18 | 84.0 → 84.0 | 309,120 → 309,120 | color: 84.0 / 309,120; shadow: 0.0 / 0; post: 0.0 / 0 | color: 84.0 / 309,120; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1920×1080 | quiet-shore | low | 100.06 → 100.00 | 62.0 → 62.0 | 278,012 → 278,012 | color: 62.0 / 278,012; shadow: 0.0 / 0; post: 0.0 / 0 | color: 62.0 / 278,012; shadow: 0.0 / 0; post: 0.0 / 0 |

Đơn vị các cột pass: draw/frame / triangle/frame. Chi tiết theo từng tên mesh/material nằm trong JSON. Workshop tăng draw vì vách/fern được chia thành nhiều mảng nhỏ hơn; số tam giác shadow giảm từ 322.600 xuống 148.784 ở High 900p. Đây là đổi granularity cull, không phải tăng nội dung.

Ảnh: 8 cặp High trong `test-results/perf-hr/{before,after}/`; gallery `test-results/perf-hr/comparison-after.html`. Đã so trực tiếp đủ tám cặp ảnh ở cả hai độ phân giải. Chẩn đoán pixel: `test-results/perf-hr/image-comparison.json`, mean absolute RGB 0,36–1,51% (gió/chim/nước/streaming sống, không phải gate chất lượng cảm nhận).

### Kiểm chứng production sau sửa

GPU: `ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Edge hardware WebGL2, DPR=1. Capture hoàn tất 2026-11-14T11:55:01.448Z; 24 mẫu, 0 lỗi console/page.

High/balanced (legacy) 1600×900: **PASS** (99,96–100,16 FPS). High 1920×1080: 99,94–100,14 FPS; balanced (legacy) 77,69–99,58 FPS. Low giữ nguyên draw/tam giác ở cả tám mẫu. Nhiều mẫu sát 100 FPS cho thấy lượt đo có khả năng chạm trần refresh; đây không phải số đo throughput GPU không giới hạn.

Bảng dưới chỉ ghi production sau sửa. Baseline trước sửa được lấy bằng source harness ở bảng trên; không coi source → production là phép đo speedup có kiểm soát. Thời gian warm-up cũng khác, nên cây/chim sống có thể đổi số tam giác ở một số pose.

| Size | Zone | Quality | FPS | Draw/frame | Triangle/frame | Pass: draw/frame / triangle/frame |
|---|---|---|---:|---:|---:|---|
| 1600×900 | first-light | high | 100.02 | 197.0 | 3,322,348 | color: 145.0 / 2,517,511; shadow: 31.0 / 804,816; post: 21.0 / 21 |
| 1600×900 | roots | high | 99.96 | 319.2 | 3,158,176 | color: 281.2 / 3,128,343; shadow: 17.0 / 29,812; post: 21.0 / 21 |
| 1600×900 | workshop | high | 100.08 | 316.0 | 3,837,111 | color: 269.0 / 3,688,306; shadow: 26.0 / 148,784; post: 21.0 / 21 |
| 1600×900 | quiet-shore | high | 99.96 | 119.0 | 687,952 | color: 80.0 / 672,005; shadow: 18.0 / 15,926; post: 21.0 / 21 |
| 1600×900 | first-light | balanced | 100.16 | 172.0 | 1,488,291 | color: 125.0 / 1,393,023; shadow: 27.0 / 95,248; post: 20.0 / 20 |
| 1600×900 | roots | balanced | 100.06 | 267.9 | 1,873,856 | color: 230.9 / 1,843,594; shadow: 17.0 / 30,242; post: 20.0 / 20 |
| 1600×900 | workshop | balanced | 100.00 | 252.0 | 1,858,769 | color: 205.0 / 1,776,828; shadow: 27.0 / 81,921; post: 20.0 / 20 |
| 1600×900 | quiet-shore | balanced | 100.04 | 117.0 | 589,425 | color: 79.0 / 573,479; shadow: 18.0 / 15,926; post: 20.0 / 20 |
| 1600×900 | first-light | low | 100.04 | 67.0 | 297,338 | color: 67.0 / 297,338; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1600×900 | roots | low | 100.12 | 112.0 | 341,380 | color: 112.0 / 341,380; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1600×900 | workshop | low | 100.00 | 84.0 | 309,120 | color: 84.0 / 309,120; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1600×900 | quiet-shore | low | 99.98 | 62.0 | 278,012 | color: 62.0 / 278,012; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1920×1080 | first-light | high | 99.94 | 197.0 | 3,322,348 | color: 145.0 / 2,517,511; shadow: 31.0 / 804,816; post: 21.0 / 21 |
| 1920×1080 | roots | high | 100.14 | 319.3 | 3,228,601 | color: 281.3 / 3,198,338; shadow: 17.0 / 30,242; post: 21.0 / 21 |
| 1920×1080 | workshop | high | 100.02 | 316.0 | 3,837,111 | color: 269.0 / 3,688,306; shadow: 26.0 / 148,784; post: 21.0 / 21 |
| 1920×1080 | quiet-shore | high | 100.02 | 119.0 | 687,952 | color: 80.0 / 672,005; shadow: 18.0 / 15,926; post: 21.0 / 21 |
| 1920×1080 | first-light | balanced | 85.76 | 172.0 | 1,488,291 | color: 125.0 / 1,393,023; shadow: 27.0 / 95,248; post: 20.0 / 20 |
| 1920×1080 | roots | balanced | 96.80 | 264.0 | 1,731,146 | color: 227.0 / 1,700,884; shadow: 17.0 / 30,242; post: 20.0 / 20 |
| 1920×1080 | workshop | balanced | 77.69 | 252.0 | 1,865,653 | color: 205.0 / 1,783,712; shadow: 27.0 / 81,921; post: 20.0 / 20 |
| 1920×1080 | quiet-shore | balanced | 99.58 | 117.0 | 589,425 | color: 79.0 / 573,479; shadow: 18.0 / 15,926; post: 20.0 / 20 |
| 1920×1080 | first-light | low | 68.26 | 67.0 | 297,338 | color: 67.0 / 297,338; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1920×1080 | roots | low | 99.80 | 112.0 | 341,380 | color: 112.0 / 341,380; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1920×1080 | workshop | low | 98.88 | 84.0 | 309,120 | color: 84.0 / 309,120; shadow: 0.0 / 0; post: 0.0 / 0 |
| 1920×1080 | quiet-shore | low | 100.00 | 62.0 | 278,012 | color: 62.0 / 278,012; shadow: 0.0 / 0; post: 0.0 / 0 |

Raw: `test-results/perf-hr/production/metrics.json`; report kiểm tra đủ 24 tổ hợp, GPU RTX 3060, dữ liệu hữu hạn, tổng pass và pose trùng baseline: `node tests/review/perf-hr-report.mjs production` → exit 0. `comparison-production.md` ghi rõ capture mode khác nhau.

Đã so đủ tám cặp ảnh High source trước/sau ở 900p và 1080p, đồng thời xem tám ảnh production cùng pose: chưa thấy mất geometry/texture hoặc thay bố cục tĩnh ở khoảng cách chơi. Sai khác quan sát được ở gió/chim/nước/foam và hội tụ streaming. Production còn có HUD do đi qua app thật. Lead có thể so ảnh gốc tại gallery `test-results/perf-hr/comparison-after.html` và `comparison-production.html`; contact sheets `review-{after,production}-{900p,1080p}.png`.


### Kiểm tra độ ổn định của lượt đo gameplay

Lượt gameplay đầu dưới đây có Roots 50,36 FPS và Workshop 38,72 FPS, trong khi First Light và Quiet Shore gần 100 FPS. Giữ nguyên toàn bộ dữ liệu này. Trong thời gian đó xuất hiện thêm các tiến trình Edge ngoài phiên đo, dùng CPU đáng kể. Harness cũ chỉ bring-to-front một lần lúc khởi động và không ghi focus/visibility, nên không thể phân biệt chắc chắn ảnh hưởng tải máy với browser bị che hoặc mất focus.

Đối chiếu trong một browser mới, cùng build và cùng khu, luân phiên gameplay → postcard baseline → gameplay: High Roots và Workshop đều xấp xỉ 100 FPS; Low cũng xấp xỉ 100 FPS ở cả hai camera. Đủ 12 mẫu, 0 lỗi, tại `test-results/perf-hr/production-diagnostic/metrics.json`; log `tmp/perf-hr-diagnostic.log`. Số draw ở Workshop gameplay vẫn khoảng 400, không giảm preset hoặc geometry để tăng FPS. Chênh lệch do môi trường/focus là suy luận từ các lượt đo, chưa phải phép đo riêng từng nguyên nhân.

Harness bàn giao hiện đưa page ra trước từng khu và ngay trước cửa sổ lấy mẫu; ghi `startState`/`endState`, từ chối mẫu nếu document không visible hoặc không có focus. Lượt `production-gameplay-recheck` ghi riêng, không ghi đè lượt đầu. Không sửa runtime sau build.

### Camera gameplay bổ sung (production-gameplay)

Lượt tiếp tục hoàn tất 2026-11-14T14:27:36.382Z: camera gameplay bình thường (không đặt postcard pose), High 1600×900, DPR=1, cùng RTX 3060. Chỉ browser đo chạy trong phiên; unit test/lint/build/e2e đều đã dừng. Dừng browser và server do lượt đo tạo sau khi lấy mẫu.

| Zone | FPS | Draw/frame | Triangle/frame | Color: draw / triangle | Shadow: draw / triangle | Post: draw / triangle |
|---|---:|---:|---:|---|---|---|
| first-light | 100.12 | 177.0 | 3,150,451 | 124.0 / 2,612,350 | 32.0 / 538,080 | 21.0 / 21 |
| roots | 50.36 | 316.3 | 3,396,005 | 277.3 / 3,355,628 | 18.0 / 40,356 | 21.0 / 21 |
| workshop | 38.72 | 400.4 | 3,767,764 | 352.4 / 3,608,415 | 27.0 / 159,328 | 21.0 / 21 |
| quiet-shore | 98.38 | 143.0 | 722,208 | 103.0 / 695,717 | 19.0 / 26,470 | 21.0 / 21 |

High gameplay 900p, bốn khu: **FAIL ≥60 FPS**, 0 lỗi console/page. Đây là lượt kiểm chứng bổ sung, không thay bộ 24 mẫu đối chiếu cùng pose. Raw JSON và bốn ảnh trong `test-results/perf-hr/production-gameplay/`; log `tmp/perf-hr-production-gameplay.log`; gallery `test-results/perf-hr/production-gameplay/gallery.html`.

### Camera gameplay bổ sung (production-gameplay-recheck)

Lượt tiếp tục hoàn tất 2026-11-14T14:38:10.046Z: camera gameplay bình thường (không đặt postcard pose), High 1600×900, DPR=1, cùng RTX 3060. Chỉ browser đo chạy trong phiên; unit test/lint/build/e2e đều đã dừng. Dừng browser và server do lượt đo tạo sau khi lấy mẫu.

| Zone | FPS | Draw/frame | Triangle/frame | Color: draw / triangle | Shadow: draw / triangle | Post: draw / triangle |
|---|---:|---:|---:|---|---|---|
| first-light | 99.92 | 184.0 | 3,364,755 | 131.0 / 2,826,654 | 32.0 / 538,080 | 21.0 / 21 |
| roots | 100.02 | 327.5 | 3,762,362 | 288.5 / 3,721,985 | 18.0 / 40,356 | 21.0 / 21 |
| workshop | 97.51 | 400.6 | 3,793,504 | 352.6 / 3,634,155 | 27.0 / 159,328 | 21.0 / 21 |
| quiet-shore | 99.78 | 143.0 | 722,208 | 103.0 / 695,717 | 19.0 / 26,470 | 21.0 / 21 |

High gameplay 900p, bốn khu: **PASS ≥60 FPS**, 0 lỗi console/page. Đây là lượt kiểm chứng bổ sung, không thay bộ 24 mẫu đối chiếu cùng pose. Raw JSON và bốn ảnh trong `test-results/perf-hr/production-gameplay-recheck/`; log `tmp/perf-hr-production-gameplay-recheck.log`; gallery `test-results/perf-hr/production-gameplay-recheck/gallery.html`.

`startState` và `endState` của cả bốn mẫu đều `visibility: "visible", focused: true`; đã mở và xem gallery cả bốn ảnh gameplay High. Browser/server do phiên tạo đều đã đóng. Lint cuối sau thay đổi harness: exit 0, 0 warning; typecheck cuối exit 0; không đổi unit test/runtime sau lượt unit pass.

## Lead nối index.ts

Không cần import hoặc call mới. Giữ các đường factory/tick/render hiện có:

```ts
updateFoliageWind(composed.foliageMeshes, animDt, reducedMotion);
paper.render(scene, camera);
```
