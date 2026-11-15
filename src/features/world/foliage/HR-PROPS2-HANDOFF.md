# HR-PROPS2 — bàn giao vòng trả lại 1

[Ảnh trước/sau tám khu và bảng đo](../../../../tools/styleframes/.vite/test-results/hr-props2/report.md). Thư mục bằng chứng: `tools/styleframes/.vite/test-results/hr-props2/`. Không commit.

## Bốn điểm trả lại

1. Cây toàn cục ven Quiet Shore/Last Postcard dùng hai dáng phi lao và keo lá tràm xen kẽ: tán có nhiều lớp chùm kim rủ, phủ kín phần giữa tán, màu xanh xám; thân dùng PBR vỏ cây HR đã có. Cả hai LOD giữ tán ba chiều, không chuyển sang billboard cây nhiệt đới thưa lá. Giữ gốc và vị trí scatter. Tăng độ tròn thân High lên 10 cạnh, LOD xa 8 cạnh. Test raster hóa tán với alpha texture từ bốn hướng, ở cả hai LOD, yêu cầu che >80% phần giữa tán.
2. Lá First Light dài 5–15 cm, lòng khum nông. Mỗi đỉnh bám đúng hai tam giác terrain qua patch Float32 3×3, kể cả chỗ qua ô/đường chéo; khoảng cách tới nền <1 cm. Transform theo pháp tuyến nền, có một draw bóng tiếp xúc mềm dùng chung instance matrix. Test kiểm tra toàn bộ đỉnh của lá đã scatter, không chỉ tâm lá. Giữ nền lá Low rẻ.
3. Giữ các tối ưu đã nhận: floor chỉ rải trong frustum có đệm, giảm mật độ mép xa; cây HR gom cùng architecture/LOD qua các variant. Bổ sung cull từng instance của understorey HR trước khi compact: sphere trong hệ tọa độ mesh, cập nhật cả khi xoay camera đứng yên; đứng yên không upload lại buffer. Test kiểm tra camera quay, parent có rotation/translation, tint và matrix LOD vẫn đúng. Kết quả ba lượt production được ghi trong bảng đo.
4. `tools/assets/check-budgets.mjs` không có diff; namespace `roots-` đã có ở HEAD. Không sửa test công cụ asset hay chức năng Roots.

Các phần vòng đầu (thay cây/cỏ High toàn cục, adapter đá/gỗ PBR, fallback Low/software, lifecycle streamer) được giữ và kiểm tra lại; không làm lại ticket.

## Gate và build

```text
pnpm lint: LINT_EXIT=0, 0 warnings
pnpm typecheck: TYPECHECK_EXIT=0
pnpm test --configLoader runner --no-cache --maxWorkers=2 --testTimeout=60000:
  Test Files 195 passed (195)
  Tests 2015 passed | 1 skipped (2016)
  exit 0
pnpm check:assets: status PASS, errors []
pnpm check:licenses: RESULT: PASS
pnpm build: BUILD_EXIT=0 — đúng một lần, sau thay đổi runtime cuối
pnpm --config.verifyDepsBeforeRun=false exec playwright test world --workers=2:
  43 passed (5.1m)
  E2E_EXIT=0
```

Unit và asset check dùng biến `BUDGET_REPORT_DIR` có sẵn, trỏ vào thư mục bằng chứng mới. Vitest dùng config loader `runner` và tắt cache để tránh ghi `node_modules/.vite-temp`; không sửa config hoặc assertion để né lỗi.

Build ID cuối: `B-E3tm7HWutSQIz35v4-m`. Chạy WASM/webpack theo card, giữ nguyên `package.json`, lockfile và mọi config:

```powershell
$env:NEXT_TEST_WASM_DIR='C:\Users\PC-LP\AppData\Local\next-swc\wasm\package'
$env:NEXT_BUILD_WEBPACK='1'
pnpm.cmd build
```

Do ACL sau chuyển account chặn ghi các thư mục generated cũ, build chạy trong bản sao nguồn tại `tools/styleframes/.vite/test-results/hr-props2/build-workspace/`. `tests/review/hr-props2-stage.mjs` chỉ sao chép file trong worktree, không đổi quyền hay cài dependency. **Export cuối nằm trong `build-workspace/out/`; `out/` ở gốc vẫn là baseline main** (`fPBhyodhhHIc-EgXfszYb`). Config/runtime được đối chiếu SHA-256 với snapshot tại build; markdown bàn giao được cập nhật sau build và không thuộc runtime. Next cảnh báo suy luận workspace do hai lockfile là các bản sao giống nhau; không sửa config để tắt cảnh báo.

E2e chạy từ cwd của bản sao, config mặc định giống nguyên bản, hai worker, port 4321 phục vụ export cuối. `PATH` trỏ tới `.bin` đã cài ở worktree gốc; `verifyDepsBeforeRun=false` chỉ ngăn pnpm tự cài dependency trong bản sao. Không sửa `tests/e2e/` hay cấu hình Playwright. Lượt đầu chạy sai cwd có 39 pass / 4 lỗi EPERM ở ảnh Horizon/railing; giữ log `e2e-first-cwd.log` và trace. Lượt full chạy lại đạt 43/43 trên cùng build, không build lại.

Lượt unit đầu có 2013 assertion pass nhưng 55 suite lỗi ghi budget report EPERM; giữ `test.log`. Lượt final đổi đích báo cáo bằng biến môi trường có sẵn và pass toàn bộ. Source smoke có cửa đo First Light thấp khi đang chạy unit/build; số đó không thay cho số đo production sau khi dừng test nặng.

## Ảnh và số đo

Các lượt production được lưu theo thứ tự A1 (`before`) → B1 (`after`) → B2 (`after-repeat`) → B3 (`after-third`) → A2 (`before-repeat`); `low` là đường dự phòng. Sau đó là ba lượt xác nhận cửa sổ thường (`windowed-confirm1/2/3`), rồi một thử nghiệm toàn màn hình (`fullscreen-attempt1`). Camera giữ nguyên cho mọi lượt. Edge hardware, 1600×900, DPR 1, ghim High, warmup 25 s, đo 5 s; kiểm tra focus/visibility và GPU RTX 3060. Không chạy test/build của ticket song song với các lượt production này. Máy dùng chung nên không khẳng định speedup cô lập.

**Chưa đủ điều kiện đóng ticket: FPS FAIL.** B1/B2 đều đủ tám khu ≥60 FPS; B3 First Light là **55,78 FPS**. Hai lượt xác nhận tiếp theo cũng đủ tám khu ≥60, nhưng lượt ba lại dừng ở First Light **38,31 FPS**. Toàn màn hình vẫn **41,17 FPS**, đã xác nhận drawing buffer 1600×900 và High. Không có ba lượt liên tiếp đạt; không bỏ các cửa đo lỗi khỏi báo cáo. `performance-gate.json` giữ `high60:false` và toàn bộ lịch sử.

Visual gate kỹ thuật **PASS**: 24/24 ảnh High không đen (loại vùng UI), 8/8 cặp camera trước/sau khớp; Low Horizon **100,10 FPS, 126 draws, 317.836 triangles**. Đã xem trực tiếp ảnh production đủ tám khu và macro lá; nghiệm thu photoreal vẫn là đánh giá của Lead, không suy ra từ luma.

Diagnostic source đứng nguyên First Light ghi **48,99–86,00 FPS** khi texture giữ 86, geometry giữ 483 và hơn 65 giây không có resource library mới. GPU timer đọc đúng sau khi chờ query available; thử sắp xếp cutout theo độ sâu trong cùng cảnh không chứng minh lợi ích: A1 5,45 ms/render, B1/B2 5,64/5,68, A2 7,13 (12 render đầy đủ, `gl.finish`, shadow update bằng nhau, không dùng làm FPS acceptance). **Không áp thay đổi draw order vào runtime**. Xem `dwell/` và `gpu-sort/`.

Sau khi đóng Edge review, có quan sát GPU nền khoảng 32%; chưa xác định ứng dụng hay cơ chế gây dao động. Cần một lượt đo có GPU dành riêng để phân biệt nhiễu môi trường và giới hạn runtime; không tự dừng ứng dụng/worker ngoài ticket. Đã gửi yêu cầu điều kiện đo qua câu hỏi bất đồng bộ. `CLAUDE.md` §3.0 ghi “Benchmark GPU (T08/T09) chạy một mình — dừng mọi worker trước khi đo”; đề nghị áp dụng nguyên tắc cô lập tương tự để chẩn đoán HR. Nếu vẫn tụt khi GPU yên tĩnh, điểm 3 còn cần tối ưu tiếp; không đánh PASS có điều kiện hoặc tự build lần hai.

`round1/` giữ ảnh bị trả lại (Quiet Shore/Last Postcard và ba macro lá); ảnh main trước thay đổi nằm trong `before/`. Bảng đo ghi FPS cả ba lượt, CPU main-thread TaskDuration ms/s, số draw và tam giác submitted (gồm shadow/post pass), click → playable, byte library được request. Thêm asset public **0 byte**, không cần thêm manifest/license. `_next`: 7.368.163 → 7.380.459 byte, tăng **12.296 byte**, chưa nén.

Baseline đầu đã chụp đủ tám khu nhưng lỗi `net::ERR_NO_BUFFER_SPACE` khi quay lại chụp macro. Giữ nguyên trong `before-macro-error/` và log kèm theo; không dùng làm A1 cuối. Harness được sửa để lưu report cả khi lỗi muộn và chỉ chụp macro ở B1; baseline sạch và toàn bộ lượt production cuối đều không có browser error.

Để review lại đúng artifact, từ gốc worktree chạy:

```powershell
node tools/serve-out/index.mjs tools/styleframes/.vite/test-results/hr-props2/build-workspace/out --port 4321
```

Khi đã có điều kiện đo riêng, tái dùng build này; chưa cần build lại. Đặt `HR_PROPS_RESULTS` và `HR_PROPS_REFERENCE` cùng bằng `tools/styleframes/.vite/test-results/hr-props2`, `HR_PROPS_BUILD_DIR` bằng đường dẫn `build-workspace/.next` bên trong thư mục đó, `HR_PROPS_REQUIRE_60=1`; chạy serial `tests/review/hr-props2-review.mjs after-confirm1/2/3 http://127.0.0.1:4321`, dừng nếu exit khác 0. Chỉ khi đủ ba lượt mới chạy report/visual checker với `HR_PROPS_CONFIRMATION=1`. Các lượt FAIL cũ nằm ở tên archive riêng và không bị ghi đè.

## Phạm vi và giới hạn

Không sửa `index.ts`, `src/content/**`, package/lock/config, docs, e2e/perf specs, `scene/far-*`, `post/**`, `zones/roots*`, asset tre hay generator tre. Mọi file code mới đều trong vùng được phép. Snapshot/build/log/ảnh nằm dưới thư mục generated được ESLint và git bỏ qua; không thay file nguồn của công cụ styleframes.

Giữ collider, vertex tiếp xúc và transform của đá/gỗ tương tác. Adapter chỉ thêm mesh render PBR; Roots được loại khỏi adapter. Low, SwiftShader/llvmpipe và stream chưa xong/lỗi giữ hình học rẻ. Tán cây HR rừng/đồi xa vẫn có impostor; silhouette xa thuộc HR-FAR. Một số cây/bụi cố định trong core First Light, cây trung tâm Roots và set-piece do zone tự dựng còn hình khối đơn giản ngoài phạm vi vòng trả lại; ảnh ghi nhận để Lead đánh giá art. Cọ cố định dùng frond HR-PROPS hiện hữu.

## File bàn giao

```text
src/features/world/foliage/forest-r1.ts
src/features/world/foliage/grass-field.ts
src/features/world/foliage/ground-litter.ts
src/features/world/foliage/ground.ts
src/features/world/foliage/hr-capabilities.ts
src/features/world/foliage/hr-coastal.ts
src/features/world/foliage/hr-library.ts
src/features/world/foliage/hr-runtime.ts
src/features/world/foliage/hr-understorey.ts
src/features/world/foliage/hr-variation.ts
src/features/world/foliage/instances.ts
src/features/world/foliage/HR-PROPS2-HANDOFF.md
src/features/world/props/hr-props.ts
src/features/world/props/hr-structures.ts
src/features/world/zones/workshop.ts
tests/unit/world/foliage-assets.test.ts
tests/unit/world/grass-field.test.ts
tests/unit/world/hr-light.test.ts
tests/unit/world/hr-props.test.ts
tests/unit/world/hr-tree-runtime.test.ts
tests/unit/world/hr-props2.test.ts
tests/unit/world/zones/workshop-dressing.test.ts
tests/review/hr-props2-source.mjs
tests/review/hr-props2-review.mjs
tests/review/hr-props2-report.mjs
tests/review/hr-props2-black-frame.mjs
tests/review/hr-props2-stage.mjs
```

## Lead nối index.ts

Không cần nối thêm. Hai hook đã có tiếp tục truyền quality/clock; không thêm lần nữa:

```ts
composed.setQuality(quality);
updateFoliageWind(composed.foliageMeshes, animDt, reducedMotion);
```
