# GFX-P1 — bàn giao vòng 2, source cuối

Đã hoàn tất yêu cầu GFX-P1-return2: world e2e bằng config mặc định SwiftShader đạt 43/43; load-budget EN/VI và gate đều PASS. Chưa commit.

## Hành vi và sửa lỗi startup

Balanced/High dùng GTAO nửa độ phân giải vật lý, bloom nhẹ, grading bóng lạnh/highlight ấm và một OutputPass. High có DOF sau ít nhất 0,3 s đứng yên; tắt khi người chơi/camera di chuyển, cinematic hoặc teleport. AO/DOF chia sẻ depth thật của color pass, giữ alpha-test/discard, không vẽ lại geometry bằng override material. Bóng dùng PCFShadowMap, radius 2,5 của compose.

Trước worldBuild="done", render trực tiếp, tắt shadow map; chưa cấp post targets, compile shader hậu kỳ, tải HDRI hay tạo PMREM. Chỉ startDeferred ở nhánh gameplay sau mốc done. Low, kể cả tự giảm quality, luôn render trực tiếp và không có post/IBL/bóng.

Hàng đợi dựng cảnh giữ ngân sách 4 ms/lát nhưng dùng MessageChannel cho các lát tiếp theo, thay việc chờ timer 16 ms sau từng lát. Chờ control/paint đầu tiên và điều kiện pause giữ nguyên; đóng hai port khi xong/unmount, bỏ callback muộn. Nhánh không có window.MessageChannel dùng timer 0 ms.

Khi frame/vẽ chậm hơn 33,3 ms trong lúc world còn đang dựng, runtime chừa 150 ms sau lần vẽ để hàng đợi có thời gian CPU. Frame đầu và redraw khi pause vẫn vẽ ngay. Sau world done không còn khoảng nghỉ này, ở mọi quality.

HDRI fetch dùng AbortController; đổi quality/ẩn tab hủy request và vô hiệu kết quả muộn bằng revision. Transcode đang chạy được phép kết thúc rồi dispose, không publish/upload/PMREM khi ẩn. Hai PMREM được tạo trên hai frame, cache theo bộ HDRI/quality hiện tại; đổi giờ chỉ trộn mip, không tạo PMREM lại. Cache hoàn tất được giữ qua ẩn/hiện tab; đổi quality hoặc unmount giải phóng tài nguyên.

## File trong patch

| File | Nội dung |
|---|---|
| src/features/world/post/cinematic.ts | Pipeline GTAO/bloom/grading/DOF/OutputPass, resize/dispose |
| src/features/world/post/runtime.ts | API compose/cinematic, chốt world done, frame startup, motion/quality/lifecycle |
| src/features/world/post/HANDOFF-GFX-P1.md | Bàn giao này |
| src/features/world/sky/environment.ts | HDRI deferred, abort/revision, RGBM16 decode, PMREM/cache/trộn |
| src/features/world/sky/export-env.mjs | Tái tạo asset qua Blender MCP 9877 và KTX-Software |
| src/features/world/index.ts | Đổi import và hai lời gọi trong nhánh render; tổng nối 3 dòng |
| src/features/world/scene/compose.ts | Truyền timeOfDayAt qua optional API |
| src/features/world/dressing.ts | Lịch chạy hàng đợi 4 ms bằng MessageChannel, cleanup |
| public/world/env/kiara_1_dawn-2048.ktx2 | HDRI High |
| public/world/env/kiara_1_dawn-1024.ktx2 | HDRI Balanced |
| public/world/env/venice_sunset-2048.ktx2 | HDRI High |
| public/world/env/venice_sunset-1024.ktx2 | HDRI Balanced |
| assets/LICENSES.csv | 4 dòng CC0/provenance |
| tests/unit/world/post-c.test.ts | Pipeline, depth, DOF, startup, shadow/Low và visibility |
| tests/unit/world/environment-c.test.ts | Asset/license, abort, dispose muộn và cache qua đổi giờ/ẩn tab |
| tests/unit/world/dressing.test.ts | Throughput các lát dựng, cleanup message port; giữ parity geometry |
| tests/unit/world/contract.test.ts | Mock post/environment cho kiểm tra lifecycle |
| tests/unit/world/intro-wiring.test.ts | Chuyển mock sang runtime mới |
| tests/unit/world/secrets-wiring.test.ts | Chuyển mock sang runtime mới |
| tests/unit/world/teleport-wiring.test.ts | Chuyển mock sang runtime mới |
| tests/unit/world/vehicle-wiring.test.ts | Chuyển mock sang runtime mới |
| tests/unit/world/zones-wiring.test.ts | Chuyển mock sang runtime mới |

Ngoài danh sách đường dẫn P1: dressing.ts là một file sát bên cần sửa để hàng đợi dựng cảnh không bị SwiftShader chiếm hết lượt CPU; không đổi layout, geometry hay collider. LICENSES.csv được phần Chung GFX-PROD yêu cầu cho từng asset. Không sửa package/lockfile/config, docs, e2e/perf test, zones, layout hoặc height.

## Output lệnh trên source cuối

Log vòng này ở tmp/gfx-p1/round2/ (gitignored).

    pnpm lint
    exit 0; 0 errors, 0 warnings

    pnpm typecheck
    exit 0

    pnpm test --maxWorkers=4 --testTimeout=60000
    Test Files  155 passed (155)
         Tests  1801 passed (1801)
      Duration  273.24s
    exit 0

    bash tools/lead/gate.sh .
    GATE PASS: lint, typecheck,  Tests 1801 passed (1801)
    exit 0; không cần rerun; unit trong gate: 125.04s

    E2E_PORT=4291 pnpm exec playwright test world --workers=2
    43 passed (5.1m)
    exit 0

    PERF_PORT=4292 pnpm test:perf load-budget
    2 passed (59.7s)
    exit 0

    pnpm check:assets
    status=PASS; worldBytes=4693940; startBytes=147096; errors=[]
    exit 0

    pnpm check:licenses
    public files: 43; RESULT: PASS
    exit 0

E2E giữ nguyên playwright.config.ts, launch args SwiftShader, selection 43 test, assertion/timeout và 2 worker. Dùng server local riêng để config reuse và runner kết thúc bình thường. Các ca vehicle: E while rolling 46,6 s; brake to rest 51,1 s; E during mount 32,8 s. Log e2e-world-final.log, artifact test-results/e2e-artifacts/.

Build cuối exit 0, bằng SWC WASM:

    $env:NEXT_TEST_WASM_DIR='C:\Users\PC-LP\AppData\Local\next-swc\wasm\package'
    $env:NEXT_BUILD_WEBPACK='1'
    pnpm.cmd build

Vòng này dùng một build được cấp ở return2; build đó phát hiện vẫn còn 2 timeout pending. Sau sửa hàng đợi, dùng lần build dự phòng chưa dùng mà return1 đã cấp cho trường hợp phát hiện lỗi. Hai log build.log và build-final.log. Source cuối chỉ nghiệm thu bằng build-final.log và e2e-world-final.log. Lượt trước sửa hàng đợi 41/43 và trace lỗi được giữ ở e2e-world.log, e2e-before-queue/; không coi lượt đó là PASS.

Lint/typecheck riêng: lint-final.log, typecheck-final.log. Unit cuối: test-pass.log; gate: gate-final.log và gate-final/. Bàn giao vòng trước được lưu ở handoff-round1.md trong thư mục log.

## Load-budget EN/VI trên build cuối

3 cold load mỗi ngôn ngữ, browser/context mới, tắt HTTP cache; 10 Mbps xuống/lên, RTT 100 ms, không CPU throttling. Máy i5-14400F, RAM 32 GB, RTX 3060 D3D11, Edge 157.0.4341.46, Balanced power, 1366×800/DPR 1. Trần 10 s theo ADR 0018 và yêu cầu return1/return2.

| Locale | Lần 1 (s) | Lần 2 (s) | Lần 3 (s) | Xấu nhất (s) | Kết quả |
|---|---:|---:|---:|---:|---|
| EN | 5,4215 | 5,2674 | 5,2393 | 5,4215 | PASS |
| VI | 5,2364 | 5,2247 | 5,7639 | 5,7639 | PASS |

| Gate byte, lấy xấu nhất | EN | VI | Kết quả |
|---|---:|---:|---|
| Welcome tổng / trần 1.048.576 B | 225.496 B | 231.769 B | PASS |
| Quick tổng / trần 1.048.576 B | 184.811 B | 191.216 B | PASS |
| Welcome JS gzip / trần 153.600 B | 139.812 B | 139.812 B | PASS |
| Quick JS gzip / trần 153.600 B | 135.846 B | 135.846 B | PASS |
| Request 3D trước Enter, Welcome/Quick | 0 / 0 | 0 / 0 | PASS |
| Enter → playable, chỉ báo cáo theo ADR 0015 | 2.197.110 B | 2.197.110 B | PASS |

JSON/Markdown ở test-results/load-budget/, bản lưu vòng này ở tmp/gfx-p1/round2/load-budget/. Log load-budget.log.

## Asset và kiểm tra hình

Nguồn HDRI CC0 Greg Zaal / Poly Haven: Kiara 1 Dawn và Venice Sunset; provenance trong LICENSES.csv. RGBM16, UASTC KTX2 + Zstandard. Không tải asset mới trong lượt tiếp tục này.

| File | Byte |
|---|---:|
| kiara_1_dawn-2048.ktx2 | 1.596.087 |
| kiara_1_dawn-1024.ktx2 | 410.791 |
| venice_sunset-2048.ktx2 | 1.568.822 |
| venice_sunset-1024.ktx2 | 407.757 |
| Tổng thêm | 3.983.457 |

High chọn 3.164.909 B; Balanced 818.548 B; Low 0 B HDRI. Tổng world 4.693.940 / 30.000.000 B. Đây là file asset, không phải tổng mạng JS/WASM.

Ảnh High đủ 8 khu: round2/high/, chạy tools/review/ingame-shots.mjs với TQA_QUALITY=high, 1600×900, exit 0, không pageerror. Low: round2/low-first-light.png. Đã xem trực tiếp cả 8 High và Low. Baseline giữ từ trước ticket ở tmp/gfx-p1/before/, không build lại baseline.

| Khu | Luma trước | Luma cuối | Delta |
|---|---:|---:|---:|
| First Light | 0,225 | 0,224 | -0,001 |
| Workshop | 0,262 | 0,265 | +0,003 |
| Roots | 0,314 | 0,310 | -0,004 |
| Milestones | 0,239 | 0,234 | -0,005 |
| Old Trail | 0,438 | 0,439 | +0,001 |
| Horizon | 0,428 | 0,440 | +0,012 |
| Quiet Shore | 0,313 | 0,316 | +0,003 |
| Last Postcard | 0,336 | 0,337 | +0,001 |

Cả 8 đạt |delta| ≤ 0,03. Đã chạy luma.mjs và ground-hue.mjs; output luma-high.txt và ground-hue-high.txt.

Đo GL thật trên build cuối: RTX 3060 D3D11, gồm shadow/post, median 150–151 frame idle/khu, 1600×900, camera/seed như baseline:

| Khu High | Draw trước → cuối | Triangle trước → cuối | Delta triangle |
|---|---:|---:|---:|
| First Light | 177 → 196 | 319.609 → 319.628 | +0,006% |
| Horizon | 85 → 104 | 220.332 → 220.351 | +0,009% |
| Last Postcard | 44 → 63 | 173.023 → 173.042 | +0,011% |

Thêm 19 fullscreen draw/triangle; không thêm lượt geometry AO/DOF, dưới trần +25%. Baseline before-metrics.json; cuối round2/after-metrics.json và metrics.log, exit 0, errors=[]. Browser probe ghi cả 4 request HDRI đều có build="done", quality chỉ balanced/high; Low không yêu cầu HDRI.

Ending High: round2/ending/, đủ 9 ảnh theo timeline ending-shots, exit 0, không pageerror; cả 4 secret visit trả true. Dùng runner round1/ending-shots.mjs đã có, chỉ sửa module resolution và chọn High so với script review gốc. Đã xem ảnh 9 s, 26 s và sau ending.

## Nối index.ts và giới hạn

Đã nối sẵn trong patch, tổng 3 dòng thay/thêm. Nếu Lead ghép lại thủ công, đổi import và thêm hai lời gọi trước paper.render trong tick:

    import { createGradedPaperPass } from "./post/runtime";
    paper.setMotion(moved > 0.0001 || cinematicLocked() || teleport.inputLocked, animDt, camera.position.distanceTo(player.position));
    if (container.dataset.worldBuild === "done" && canSimulate(state) && !cinematicLocked()) paper.startDeferred(scene);

Compose gọi paper?.setTimeOfDay?.(timeOfDayAt(t)); giữ lifecycle setSize/setQuality/dispose. Không đổi WORLD_DIRECTION sang preset C cũ của spike paper. Knob mist/corridor vẫn nhận lệnh cinematic; native fog/dome/mist geometry giữ hoạt động.

Giới hạn cần giữ khi merge:

- Iris Xe/T08 chưa nghiệm thu; CPU ABBA so main do Lead đo theo phần Chung GFX-PROD.
- Khoảng nghỉ 150 ms chỉ phục vụ dựng optional world khi renderer chậm; không áp dụng sau world done. Frame đầu và redraw khi pause không chờ.
- Vật liệu MeshToonMaterial hiện có không nhận scene.environment; IBL áp dụng cho PBR hiện có và P2/P3/P4 sau merge.
- RGBM16 giới hạn radiance ở 16; mặt trời dùng DirectionalLight riêng. HDRI tùy chọn lỗi vẫn giữ sun/hemi.
- Low không tải bản 512 vì không bật IBL theo ADR 0018.
- Tái tạo asset: node src/features/world/sky/export-env.mjs với Blender worker 9877 và KTX-Software; --packed dùng nguồn đã import. File trung gian, ảnh, log và runner tạm chỉ ở tmp (gitignored).
