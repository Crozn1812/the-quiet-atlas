# HR-GROUND — bàn giao

[Gallery High trước/sau + Low](../../test-results/hr-ground/gallery.html) · [Bảng FPS/draw/tam giác/byte/CPU](../../test-results/hr-ground/report.md) · [CPU ABBA gốc](../../test-results/hr-ground/abba.json) · [Build và SHA-256](../../test-results/hr-ground/build.json)

Vật liệu nền Balanced/High dùng ảnh CC0 hiện hữu với normal/roughness, bỏ phép nhân/chặn biên độ theo màu pastel. Mask theo sinh cảnh, độ dốc, độ cao trên mặt nước và khoảng cách suối chọn cỏ, đất sỏi, lá mục và cát. Mảng 11/19/47 m, hai hướng UV không đồng chu kỳ và warp làm thay đổi sắc độ/lộ đất ở xa; màu, normal và roughness dùng cùng tọa độ/trọng số. Cát thấp tối hơn, giảm roughness và có vệt đọng theo cao độ. Nhánh vách đá vẫn dùng cliffWeather/cliffPigment và sampler triplanar cũ, chuyển tiếp theo cliff mask cũ.

Không đổi heightfield, collider, đường hoặc buffer vị trí/normal/index/màu cũ. So sánh byte 8 khu PASS; 2048 → 2048 tam giác/tile. Mask thêm 17.424 byte CPU/tile; High upload thêm attribute tương ứng, cliff skin cũng nội suy attribute. Không thêm draw nền hoặc file public; asset mới 0 byte. Low/software tiếp tục flat fallback. Deferred load, hủy request khi đổi chất lượng và dispose giữ cơ chế cũ.

## File thay đổi

- `src/features/world/materials/ground.ts`: shader nền và pha trộn ảnh/normal/roughness.
- `src/features/world/materials/cc0.ts`: gắn shader cho riêng terrain Balanced/High, giữ nhánh cliff và material khác.
- `src/features/world/terrain/mesh.ts`: thêm attribute `groundSurface` (hill weight, moisture, above-water height, road protection).
- `tests/unit/world/terrain-mesh.test.ts`: hợp đồng attribute và kiểm tra 4 kênh mask liền mạch qua mép tile.
- `tests/review/hr-ground.mjs`: ảnh/metrics export, dùng `tools/review/ingame-shots.mjs`, pose cố định, xác nhận chất lượng/GPU/focus/GL.
- `tests/review/hr-ground-source.mjs`: xem shader bằng Vite trước build, chặn shader/page errors.
- `tests/review/hr-ground-geometry.mjs`: so byte toàn bộ attribute cũ/index với HEAD trước ticket; Node factory ABBA.
- `tests/review/hr-ground-abba.mjs`: bốn phiên Edge nối tiếp A1 B1 B2 A2; 12 s native GL FPS/CPU tại Roots, warmup 45 s.
- `tests/review/hr-ground-report.mjs`: xác nhận 9 cặp pose, tạo gallery và bảng số liệu, đo JS/gzip/hash.
- `tests/review/HR-GROUND-HANDOFF.md`: bàn giao này.

Không có file production ngoài phạm vi. Không sửa `index.ts`, foliage, props, dressing, sky, far scene, vehicle, post, content, package/lock/config, docs hoặc e2e/perf tests. Không commit/rebase.

## Lệnh và dòng tổng kết

PowerShell chặn launcher `pnpm.ps1`; dùng `pnpm.cmd` cùng lệnh, không đổi execution policy.

```text
pnpm.cmd lint                         exit 0; 0 error, 0 warning
pnpm.cmd typecheck                    exit 0 ($ tsc --noEmit)
pnpm.cmd test                         exit 0
  Test Files  197 passed (197)
       Tests  2011 passed | 1 skipped (2012)
    Duration  82.17s
pnpm.cmd check:assets                 exit 0; status PASS (report-only)
pnpm.cmd check:licenses               exit 0; public files: 197; RESULT: PASS
```

Build đúng một lần sau khi chốt mã runtime, WASM/webpack:

```powershell
$env:NEXT_TEST_WASM_DIR='C:\Users\PC-LP\AppData\Local\next-swc\wasm\package'
$env:NEXT_BUILD_WEBPACK='1'
pnpm.cmd build
```

Build exit 0, `Compiled successfully in 3.1s`, `Generating static pages ... (22/22)`, CV/OG xong. BUILD_ID `K9FBmyI3MGMKvBZ8AOe3I`. Sau đó chỉ bổ sung/chỉnh công cụ review và báo cáo; mã runtime không đổi.

```text
pnpm.cmd exec playwright test world --workers=2
  43 passed (8.6m)
  exit 0; .last-run.json: status passed, failedTests []
```

E2e dùng nguyên config Edge/SwiftShader và 2 worker. Sau khi mọi ca PASS, Playwright kẹt ở shutdown server; dừng riêng PID 28184 do webServer của lượt này tạo, runner sau đó trả 0. Không sửa fixture, config hoặc thời hạn test. Lint chạy trong lúc e2e còn tạo trace đã quét nhầm JS sinh ra; lượt lint cuối sau trace cleanup sạch 0 warning. Bản export baseline tạm ban đầu cũng được chuyển vào cache trước lượt lint cuối.

## Tái lập ảnh/đo

Baseline nguyên export trước ticket: `node_modules/.cache/hr-ground-baseline-out/`, build `TnZcGGvGi2aJT5vkXv6nW`. Đây là bản lưu từ export đã có, không build baseline thêm lần nữa. Pose gốc: `test-results/hr-ground/poses.json`. `before/` có 9 ảnh đầu; `before-touchups/` chứa hai góc Roots/Last Postcard được chụp lại từ cùng export baseline để nhìn rõ nền. Gallery dùng hai ảnh này, giữ ảnh đầu để truy vết. Bộ `after/` là lượt đầu 20 s warmup/3 s đo; `after-confirm/` là toàn bộ cohort xác nhận 45 s warmup/10 s đo. `low/` có Horizon Low từ build cuối.

```text
node tools/serve-out/index.mjs node_modules/.cache/hr-ground-baseline-out --port 4311
node tools/serve-out/index.mjs out --port 4312
node tests/review/hr-ground.mjs low http://127.0.0.1:4312
```

ABBA đã chạy bằng PowerShell với `HR_GROUND_PROFILE_ZONE=roots`, `HR_GROUND_WARMUP_MS=45000`; truyền hai URL 4311 và 4312 vào `hr-ground-abba.mjs`. Giữ nguyên lượt `after/` đầu: Roots 45,60 FPS tại cửa sổ 3 s, task 956,92 ms/s. Không dùng lượt này chứng minh High ≥60; đối chiếu ABBA và bộ xác nhận trong báo cáo số liệu.

```powershell
$env:HR_GROUND_WARMUP_MS='45000'
$env:HR_GROUND_SAMPLE_MS='10000'
node tests/review/hr-ground.mjs after-confirm http://127.0.0.1:4312
$env:HR_GROUND_FINAL_LABEL='after-confirm'
node tests/review/hr-ground-report.mjs
```

Roots native ABBA A1/B1/B2/A2: 88,25 / 90,10 / 85,01 / 86,30 FPS. Trung bình trước → sau 87,27 → 87,56 FPS, 128 draw và 5.925.728 tam giác giữ nguyên. CPU task 756,06 → 836,54 ms/s; script 722,24 → 793,65 ms/s. Marker intro-done QA 9.042,20 → 9.539,70 ms. Asset +0 byte; tổng JS chunk +4.889 byte raw / +1.165 byte gzip (gzip riêng từng chunk, không phải đo transfer HTTP).

Bộ xác nhận đủ 8 khu + góc đỉnh Horizon: **76,82–100 FPS**, PASS ≥60 ở các góc đã đo; không suy rộng sang mọi góc hoặc phase cold-load. Báo cáo/ảnh tạo thành công: `Gallery: 9 matched High pairs + 1 Low; export K9FBmyI3MGMKvBZ8AOe3I; PASS measured High FPS`. Lượt `after/` đầu bị tụt Roots vẫn giữ; không thay runtime hoặc build lại để tạo bộ xác nhận. Các số draw/tam giác tổng cảnh giữa phiên không phải phép cô lập module; chỉ buffer/triangle của ground được kiểm tra bất biến trực tiếp.

Chạy browser nối tiếp; không chạy e2e/build trong cửa sổ ABBA. Gallery chạy trực tiếp bằng file HTML, không cần tải ngoài. Thời gian tới playable ghi theo `intro=done` với QA skip intro; không coi đó là phép đo first-input ACK hoặc thời gian cinematic thật.

## Giới hạn

- Tái sử dụng atlas mixed: forest/river rocks/rock/bark 2K; grass/sand/dirt vẫn 1K. Chưa có ảnh nền cỏ/cát 2K/4K riêng; không upscale để giả độ phân giải. Không tải file ngoài hoặc sửa asset pipeline trong ticket này.
- Chưa có đánh giá mù so với ảnh chụp thật để xác nhận ngưỡng photoreal. Gallery và số liệu là bằng chứng thay đổi; không coi gate kỹ thuật là duyệt mỹ thuật.
- Lưới ground 2 m, silhouette và các vùng far, cây/props, trời/sương, nước giữ thiết kế hiện hữu. Các phần đó vẫn ảnh hưởng cảm giác thật của toàn cảnh.
- Máy dùng chung; FPS có giới hạn cadence màn hình, gió/sóng/LOD không khóa. Bảng toàn cảnh đo có observer GL cho cả A/B; ABBA gỡ hook trong cửa sổ native FPS/CPU. Không suy ra speedup từ chênh lệch các phiên.
- Không thêm displacement mặt nền hoặc normal map mới; có micro-normal từ ảnh và sắc độ lớn trong shader. Cát ướt/vệt đọng là vật liệu tĩnh, không sửa mô phỏng sóng.
- Ảnh Low chọn chất lượng qua menu sau Enter World; dùng để xác nhận hình Low, không dùng làm số liệu cold-Low network. Hành vi controller không tải ảnh ở Low/software nằm trong unit tests.

## Lead nối vào index.ts

Không cần nối thêm: đường `compose → bindTerrainDetail → createPhotoSurfaces` đã gọi material mới, và `createTileMesh` đã cấp mask. Không tạo binding thứ hai trong `index.ts`.

```ts
// Chuỗi gọi đã có, không cần thêm vào index.ts:
// composeWorld(...) -> bindTerrainDetail(...)
// -> createPhotoSurfaces(...).setQuality(quality)
// -> createPhotoMaterial("terrain", original, textures, size)
// Balanced/High tự chọn groundSurfaceShader; Low/software giữ fallback.
```
