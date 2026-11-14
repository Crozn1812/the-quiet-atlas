# HR-TREE2 — bàn giao vòng trả lại 1, 14/11/2026

Trạng thái: **PASS — world 43/43**, ba gate cơ bản exit 0, lint 0 warning. Build đúng một lần. Không commit.

Ảnh và số đo cuối: [return1-report](../../../../test-results/hr-tree2/return1-report.md). Thư mục `test-results/hr-tree2/` và log `tmp/` bị gitignore; Lead cần giữ/copy khi thu worktree. [Bàn giao trước](../../../../test-results/hr-tree2/return1-previous-handoff.md) và [report lịch sử](../../../../test-results/hr-tree2/report.md) giữ bằng chứng 41/43, không phải kết quả vòng này.

## Nguyên nhân và sửa vòng trả lại

- Trace phanh cũ: hai rAF mất 5,886 giây, xe vẫn đi 0,1556 m; trace ca kia không hoàn tất lên xe trong 15 giây. Không phải bằng chứng collider kẹt.
- Đối chứng cùng export trước sửa, hai phiên SwiftShader song song, nguyên thao tác/deadline: HR thường lỗi ở drive/brake; chỉ chặn asset HR thì cả hai qua. Frame sau build trung bình 1.001–1.163 ms, tối đa 5.100 ms; chặn HR: 730–748 ms, tối đa khoảng 2.110 ms. Đây là chẩn đoán, không cộng vào official e2e. Profile JSON và trace gốc nằm trong report. Phép đo tách được hồi quy HR streaming/upload/compile/render khỏi physics, chưa chia riêng chi phí từng bước GPU/decode.
- `hr-runtime.ts`: nhận diện CPU rasterizer bằng renderer WebGL (SwiftShader/llvmpipe/softpipe/software rasterizer), giữ rừng dự phòng tĩnh trước khi tải/compile HR, kể cả menu đang chọn High. Không dựa UA hay QA hook. High trên GPU phần cứng vẫn dùng HR đầy đủ. Material mask tạo trễ khi asset thay thế đã tới; chỉ quét lại frustum/LOD khi camera đi 0,5 m, đổi hướng/projection, cadence hoặc asset; chỉ upload mask đổi giá trị. Hủy timer cũ khi đổi quality.
- `hr-library.ts` / `hr-material.ts`: thân dây nâu mảnh, lá rêu nhỏ có nếp gấp, xoay xen kẽ dọc đúng đường cong. Dùng vertex pigment và ánh sáng vật liệu thông thường; bỏ crown tint/backlight trên dây. Ivy bark có sẵn cũng dịu lại. Không emissive.
- Rễ xanh phẳng ở Roots/elf thuộc geometry moss trong `zones/roots.ts` và `roots-dressing.ts`; chỉ ghi nhận, không sửa.

## Toàn bộ file bàn giao

Trong `src/features/world/foliage/`:

- `hr-variation.ts`: seed theo tọa độ, 12 kiến trúc HR-TREE1, phân sinh cảnh, tránh trùng kiến trúc lân cận qua ranh tile/grove; registry trong RAM Scene, giữ lựa chọn khi revisit.
- `hr-library.ts`: indexed PBR primitives, UV/normal/maps, decoder KTX2/meshopt tải trễ, queue dùng chung theo renderer, lease/refcount cả in-flight, dây leo neo trên cành thật.
- `hr-material.ts`: gió thân/cành/lá/dây trong shader, cùng displacement ở color/depth/distance; tint/AO/backlight tán; sửa UV atlas impostor.
- `hr-runtime.ts`: nối factory sẵn có, chờ intro/build/simulation, LOD/hysteresis/frustum, instancing, fade/shadow, mạng lỗi hoặc Low giữ fallback, thêm đường phần mềm và tối ưu vòng trả lại như trên.
- `hr-understorey.ts`: dương xỉ/bụi/cây con quanh gốc, tránh đường/suối/khu nội dung, chỉ cập nhật khi camera đi đủ 0,5 m hoặc đổi quality. Giữ gỗ/lá mục của ground hiện có.
- `first-light-grove.ts`: gắn binding HR; cache height khi dựng grove; helper lá gấp cho landmark merged mesh, không đổi collider.
- `forest-r1.ts`, `forest-ceiling.ts`, `instances.ts`: nối binding/clock qua factory và tick sẵn có; giữ mái FL-03 và cây elf Roots.
- `HR-TREE2-HANDOFF.md`: file này.

Ngoài foliage:

- `src/features/world/zones/first-light.ts`: **ngoài phạm vi foliage**, một dòng import helper `createDetailedFirstLightTree` để landmark gộp trong mesh zone dùng lá gấp. File sát bên cùng tính năng theo ngoại lệ B2 đã được người dùng cho phép; thay đổi có sẵn từ lượt trước, không sửa collider/content.
- `tests/unit/world/hr-tree-runtime.test.ts`: 11 test về seed/lân cận, PBR, dây leo tối/không backlight, readiness, quality/failure/late arrival/teardown/fade/wind, buffer/cull/cadence; hồi quy SwiftShader và llvmpipe không tải HR/không đổi material dự phòng.
- `tests/unit/world/zones/first-light.test.ts`: cache hàm terrain cho các đỉnh lá trùng trong grounding test; giữ mọi kiểm tra/deadline.
- `tests/review/hr-tree2-review.mjs`: ảnh cùng camera qua `tools/review/ingame-shots.mjs`, CDP CPU, WebGL draw/triangle, timing/bytes.
- `tests/review/hr-tree2-impostor.mjs`: viewer kiểm tra atlas bốn hướng, alpha/mép ảnh, giữ từ lượt trước.
- `tests/review/hr-tree2-report.mjs`: tái tạo report lịch sử ABBA từ phiên trước.
- `tests/review/hr-tree2-vehicle-profile.mjs`: chẩn đoán đối chứng HR/chặn HR trên cùng export, hai phiên software song song, nguyên thao tác/deadline xe; không sửa e2e.
- `tests/review/hr-tree2-return1-report.mjs`: report vòng này, đọc log gate thật và kiểm tra mọi liên kết bằng chứng.

Không sửa `index.ts`, package/lock/config/docs/content, `tests/e2e/`, `tests/perf/`, public hoặc LICENSES. Không dependency mới, tải file ngoài hoặc lưu trạng thái bền. Public thêm **0 B**.

## Lệnh và output cuối

```text
pnpm lint: exit 0, 0 warning
pnpm typecheck: exit 0
VITEST_MAX_WORKERS=2 pnpm test:
  Test Files 178 passed (178)
       Tests 1893 passed (1893)
  Duration 269.35s; exit 0
NEXT_TEST_WASM_DIR=C:\Users\PC-LP\AppData\Local\next-swc\wasm\package NEXT_BUILD_WEBPACK=1 pnpm build: exit 0
pnpm exec playwright test world --workers=2: 43 passed (7.5m); exit 0
```

PowerShell dùng `pnpm.cmd` do policy shim `.ps1`. Build **một lần trong vòng trả lại này**, source runtime cuối đã nằm trong export; không sửa runtime sau build. Log: `tmp/hr-tree2-return1-{lint,typecheck,test,build,e2e,before,after,low}.log`.

Capture High trước/sau: 4 khu × near/mid/far = 12 cặp, cùng script và camera; Low: 3 góc First Light. Cả ba lượt capture exit 0, page/console error = 0. HR đầu trong lượt after bắt đầu sau mốc chơi được **3.137 ms**. Ảnh/số đo final ở `return1-before/`, `return1-after/`, `low-return1/`. ABBA cũ vẫn giữ với nhãn lịch sử; bảng trước/sau vòng này là số đo chẩn đoán trên máy dùng chung, không khẳng định speedup có kiểm soát.

Một lượt lint chạy cùng lúc Playwright đã đọc nhầm JS generated trong resource trace tạm và báo lỗi; chạy lại sau e2e kết thúc để kiểm chứng source với nguyên config, không đổi ignore/config.

Ghi chú teardown Windows: sau khi đủ 43 ca PASS, webserver do Playwright mở vẫn sống khiến runner chờ dọn dẹp. Đã dừng đúng process server PID 28252 được ghi trong log bằng `Stop-Process`; runner tự hoàn tất, in `43 passed (7.5m)` và trả exit 0. Không dừng runner, không sửa test/config/deadline. File `.last-run.json` ghi `status: passed`, `failedTests: []`.

## Lead nối vào index.ts

Không cần import/call mới. Factory tự nối; giữ tick hiện có:

```ts
updateFoliageWind(composed.foliageMeshes, animDt, reducedMotion);
```

## Giới hạn đã biết

- Renderer phần mềm giữ silhouette dự phòng ít chi tiết hơn GPU High để bảo đảm chức năng. Không đo/frame-budget tuyên bố hiệu năng Iris Xe.
- Chưa khẳng định đạt photoreal. Silhouette tre/atlas lá phụ thuộc kho HR-TREE1; terrain, set-piece và rễ xanh Roots ngoài scope còn giữ phong cách cũ.
- Khi pool kiến trúc phù hợp bị hàng xóm dùng hết vẫn có thể lặp kiến trúc; transform/tint/pha khác nhau.
- Ảnh High dùng RTX 3060; e2e dùng SwiftShader. CPU CDP TaskDuration không bao gồm GPU/system CPU. Wind/fog/streaming sống nên ảnh cùng camera không đồng nghĩa pixel-identical.
- Góc Low mid có thể xuyên tán dự phòng ở mép trên; giữ cả near/far để Lead đánh giá.
