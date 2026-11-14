# HR-TERRAIN-CLIFF — trả lại vòng 1

Không commit. Không sửa index.ts, collider/heightfield, tuyến đi, vị trí tương tác, content, public asset, dependency hay config. Không tải file ngoài, không thêm trạng thái persistent.

## Kết quả và cách làm

- Vách High/Balanced có bậc trầm tích bất đối xứng, hõm và khe tách thực bằng CPU displacement khi nạp GLB, trước khi chia cull section. Khắc vào trong đến khoảng 1,88 m; hàm relief có gờ ngoài tối đa 0,44 m. Lớp visual terrain riêng có offset ngoài tối đa 0,48 m. Giữ nguyên toàn bộ mesh gameplay và raycast gốc.
- Mép trên bị xói không đều theo world-space; đất/rêu phủ trực tiếp trên mặt cap bằng triplanar. Cây/fern thuộc chính GLB vách hạ theo cùng trường xói để không treo trên không. Không sửa hệ foliage.
- Weld hướng chuyển động tại các position trùng qua seam UV/normal; lọc normal theo không gian để không dùng hạt normal của scan làm displacement cỡ mét. Chuyển position/normal quantized sang Float32 trước khi ghi.
- Phối rock_face đã xử lý trong map vách với rock_face và river-stone trong atlas địa hình hiện có, ở tỉ lệ 2,6 / 8,3 / 4,7 / 1,9 m, warp và noise lớn. Vệt ẩm sẫm, rêu ở gờ và mảng khô thay đổi theo world-space; roughness giữ đúng kênh B của atlas địa hình.
- Đá vụn HR slate/moss nhiều cỡ ở chân, đất/lá có photo texture và mép stipple, lá gấp/cỏ xen. Geometry gộp, batch đá dùng cache/LOD/cull sẵn có. Rễ/dây leo bám từ mép xuống theo relief.
- Low/software không dựng lớp mới hoặc tải map/GLB High. Tất cả detail theo vòng đời controller hiện có, tắt khi Low và giải phóng khi streaming/unmount.

## File bàn giao

Runtime (6):
- `src/features/world/materials/cc0.ts`
- `src/features/world/materials/cliff.ts` (mới)
- `src/features/world/terrain/mesh.ts`
- `src/features/world/terrain/cliff-relief.ts` (mới)
- `src/features/world/terrain/cliffs.ts` (mới)
- `src/features/world/zones/first-light-cliff-cull.ts`

Unit (3):
- `tests/unit/world/terrain-mesh.test.ts`
- `tests/unit/world/terrain-cliff.test.ts` (mới)
- `tests/unit/world/terrain-cliffs-lifecycle.test.ts` (mới)

Review (6): file bàn giao này, `tests/review/hr-terrain-cliff.mjs`, `hr-terrain-cliff-source.mjs`, `hr-terrain-cliff-geometry.mjs`, `hr-terrain-cliff-report.mjs`, `hr-terrain-cliff-abba.mjs`.

Không có file source ngoài phạm vi. Snapshot, log, ảnh và export baseline chỉ là artifact ignored trong test-results/ và node_modules/.cache/. Không thêm public asset; license CC0 hiện có giữ nguyên.

## Nối vào index.ts

Không cần sửa index.ts. Hook hiện có: bindTerrainDetail → createPhotoSurfaces → createTerrainCliffs; cull hook xử lý riêng GLB spring. Giữ một controller như hiện tại:

```ts
const detail = bindTerrainDetail(scene, terrainMaterial, quality, onError, true);
detail.resume();
detail.setQuality(nextQuality);
// teardown
detail.dispose();
```

## Gate, build và e2e

Tất cả exit 0. PowerShell máy này chặn shim pnpm.ps1; dùng pnpm.cmd, không đổi ExecutionPolicy.

```text
pnpm.cmd lint                              exit 0, 0 warning
pnpm.cmd typecheck                         exit 0
pnpm.cmd test --maxWorkers=1                exit 0
  Test Files  194 passed (194)
       Tests  1998 passed | 1 skipped (1999)
    Duration  465.57s
pnpm.cmd build                             exit 0 (đúng 1 lần)
E2E_PORT=4288 pnpm.cmd exec playwright test world --workers=2
  43 passed (6.7m)                          exit 0
pnpm.cmd check:assets                      exit 0, PASS (report-only)
pnpm.cmd check:licenses                    exit 0, RESULT: PASS, 197 public files
```

Build dùng NEXT_TEST_WASM_DIR=C:\Users\PC-LP\AppData\Local\next-swc\wasm\package và NEXT_BUILD_WEBPACK=1. Build ID: `fPBhyodhhHIc-EgXfszYb`. Không thay runtime sau build. Server ảnh/đo: port 4289; baseline export vòng 0: port 4297.

Playwright báo đủ 43 test pass, sau đó teardown chờ web server. Dừng riêng helper web server PID 4176 của lượt đó sau khi tests hoàn tất; Playwright in tổng kết và trả exit 0. Không dừng test/browser, không thay config.

Không tăng timeout/assertion và không sửa tests/e2e hay tests/perf. Lượt unit đầu chạy đồng thời source preview có 1 timeout 15 s trong secrets-wiring; 193 file còn lại pass. Giữ log tại `unit-under-browser.log`. Kết quả lượt chạy đầy đủ riêng bên trên là gate cuối.

## Bằng chứng hình và geometry

Artifact gốc: `test-results/hr-terrain-cliff/return1/`.

- `comparison.webp`, `comparison.html`: 7 góc High giống comparison vòng trước — First Light, spring ribbon, west, central, east, end, driving — cộng ảnh cận crest. Trái là bản bị trả lại vòng 0, phải là bản sửa vòng 1; cùng camera và viewport 1600×900.
- `before/`, `after/`: 7 góc yêu cầu + crest. Ảnh vách lấy từ A2/B2 sau cửa sổ đo ABBA; ảnh driving chạy lại riêng tuần tự. Low ở `low/first-light.png`.
- `preview-release/`: source preview trước build, không lỗi page/console. Đây là ảnh chẩn đoán; gallery bàn giao dùng export production.
- `geometry.json`: kiểm GLB thực (144.350 vertex / 232.236 triangle, không tăng topology); offset ngang lớn nhất 1,88 m; hạ crest lớn nhất 1,73 m; 28.185 vertex seam trùng vị trí không hở (maxSeam = 0). Offset lớn là khắc vào trong; gờ ngoài bị chặn trong hàm và unit test.
- `build-identity.json`: build ID và SHA256 cả 6 file runtime, đối chiếu bản build đã dùng cho e2e/ảnh.

Áp lớp visual theo slope trên mọi terrain tile resident/streamed, không hard-code tọa độ First Light. Tham chiếu dữ liệu đủ 8 zone đã lưu ở poses.json của vòng trước: ngoài spring, các sườn cao nhất quanh Workshop / Roots / Milestones / Old Trail / Horizon / Quiet Shore / Last Postcard có slope 0,419 / 0,449 / 0,494 / 0,333 / 0,653 / 0,427 / 0,363 (cửa sổ 40 m), dưới ngưỡng vách 35°. Heightfield và các hàm lấy mẫu không thay đổi trong vòng này; không ép các sườn thoải thành vách. Gallery vòng này tập trung đúng 7 góc Lead yêu cầu và crest. Không chạm scene/far-* của HR-FAR.

## Hiệu năng và byte

ABBA chính thức chạy bốn browser Edge độc lập theo A1 → B1 → B2 → A2, đóng browser trước lượt kế tiếp; mỗi lượt warm High rồi lấy mẫu 12 s. Dữ liệu tại `abba.json` và `A1|B1|B2|A2/metrics.json`.

| Góc tán cây / chỉ số | Trước (A1/A2) | Sau (B1/B2) |
|---|---:|---:|
| FPS trung bình ABBA | 70,50 | **67,64 (-4,1%)** |
| Draw/frame | 492 | 481 |
| Tam giác/frame, mọi pass | 11.945.078 | 12.204.446 (+2,17%) |
| CPU task ms/giây | 367,28 | 348,62 |
| Click → playable, ms | 9.387,25 | 9.486,05 |

FPS thô A1 / B1 / B2 / A2: **70,9409 / 67,6103 / 67,6667 / 70,0499**. Draw lần lượt 482 / 481 / 481 / 502; tam giác 11.776.896 / 12.204.446 / 12.204.446 / 12.113.260. Giữ rõ chênh lệch residency của hai lượt A, không giấu số thô.

**Chưa đạt điều kiện “không làm tụt thêm FPS”.** Góc đo vẫn trên 60 FPS, nhưng số đo cùng máy/camera giảm 4,1%; không dùng baseline lịch sử 47 FPS để gán PASS. Bản này chưa đủ điều kiện đóng ticket. Giữ đúng một build đã được yêu cầu; không sửa runtime sau build để bằng chứng/e2e vẫn khớp.

Các thử nghiệm đo hai trang cùng browser không bảo đảm trang nền ngừng render nên đã loại khỏi kết luận; giữ log/json `abba-two-windows`, `abba-visibility-attempt`, `abba-frozen-attempt` để kiểm toán. Không dùng các số đó thay cho ABBA độc lập ở trên.

| Driving / chỉ số | Trước | Sau |
|---|---:|---:|
| FPS | 88,67 | 87,85 |
| Draw/frame | 776,42 | 777,79 |
| Tam giác/frame | 10.965.482 | 11.410.468 |
| CPU task ms/giây | 834,11 | 824,54 |
| Click → playable, ms | 9.399,4 | 9.510,3 |

Hai lượt driving cuối chạy riêng, không chồng browser; report tại `test-results/hr-gd110/world-terrain-return1-before/report.json` và `world-terrain-return1-after/report.json`. Cùng anchor `[11.735097694396973, 7.272967414855957, -0.8866074681282043]`, cùng lệnh W 6 giây, không lỗi page/console. Low: **100 FPS, 73 draw/frame, 297.826 triangle/frame**, không lỗi page/console.

Asset public mới: **0 byte**. JS tăng so với bản trả lại: **8.376 byte raw / 2.522 byte gzip level 9** (`bytes.json`). Tổng trước/sau raw 6.805.770 / 6.814.146; gzip 2.400.889 / 2.403.411. Tái dùng toàn bộ KTX2/GLB đã có; không bổ sung texture hoặc license.

Edge hardware, RTX 3060 D3D11, 1600×900, DPR 1, High được chọn qua menu. Browser chạy tuần tự, không chạy unit/build/e2e khi đo. FPS/draw/tam giác gồm mọi pass; CPU là CDP TaskDuration mỗi giây. Máy chia sẻ tải với worker ngoài ticket, không phải benchmark cô lập.

## Giới hạn

- Art sign-off thuộc Lead; gallery cho thấy hình khối thật và mép gồ ghề để duyệt, không tự gán photoreal sign-off.
- Low/software giữ fallback cũ; e2e world dùng config SwiftShader mặc định. Geometry/collider nguồn được giữ nguyên và High chỉ thay visual mesh raycast-free.
- Rễ/lá bổ sung tĩnh, không thêm animation hoặc công việc theo frame; relief chỉ tính khi dựng/nạp detail.
- Góc tán cây vốn khoảng 47 FPS, theo yêu cầu trả lại không bắt nâng lên 60; số đo trước/sau và độ biến thiên ghi phía trên.
