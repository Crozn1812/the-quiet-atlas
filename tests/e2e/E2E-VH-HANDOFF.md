# E2E-VH — bàn giao ngày 2026-11-14

Đã sửa hai chỗ test lấy thời gian thực làm thời gian simulation. Bản sửa PASS cả 3 ca ở một worker. Hai worker vẫn có timeout dựng cảnh trên main trước khi lên xe; bàn giao theo nhánh **nguyên nhân + trace**, chưa đạt gate e2e 3/3 lượt PASS. Không sửa app, config, dependency; không commit.

## Nền chạy và phạm vi

- HEAD `426bc0b289ede1a38df1b1695bcd27a3bb8eb283`, bằng `main` tại lúc bắt đầu; worktree sạch trước ticket.
- Build app đúng **một lần**, exit 0, dùng WASM + webpack. Các sửa đổi sau build chỉ thuộc test nên vẫn dùng cùng `out/`.
- Config gốc `playwright.config.ts`: local Edge headless (`msedge`), `--enable-unsafe-swiftshader --use-angle=swiftshader`, 1280×720, motion đầy đủ, High sau khi dựng cảnh. Không dùng config perf/GPU khác, không bật retry.
- `E2E_PORT=4197` chọn server riêng của ticket; reporter `list,json` và outputDir riêng chỉ để giữ bằng chứng. Không sửa config. Sáu lượt baseline chạy tuần tự, xen kẽ hai/một worker; không chạy build/lint/unit cùng các ca đo.
- Thời gian `build` bên dưới đo bằng MutationObserver từ click **Enter World** tới lần đầu `data-world-build="done"`, đơn vị ms. `—` nghĩa là chưa thấy done khi assertion 90 s kết thúc. Assertion bắt đầu sau `enterWorld()`, nên build tính từ click có thể lớn hơn 90 s mà assertion vẫn PASS.
- Thời gian ca lấy từ JSON reporter, gồm fixture/teardown của ca. Windows giữ lượt đầu tại teardown webServer sau khi cả 3 ca đã xong; đã dừng đúng server do ticket tạo (PID 8332, port 4197) sau các lượt còn lại. Vì vậy tổng lệnh đầu in 29.0m, không dùng số đó để suy ra thời gian simulation. Các ca đo không chạy chồng nhau; chỉ server/runner teardown còn chờ.

Các file thay đổi để Lead review:

1. `tests/e2e/world-vehicle.spec.ts`: đồng bộ việc đo quãng đường/phanh với rAF; giữ các assertion và ngưỡng.
2. `tests/e2e/helpers/vehicle-diagnostics.ts`: quan sát trạng thái build/pause/vehicle, focus, visibility, phím; đính kèm JSON và in thời gian build. Không thay đổi focus/input/app state.
3. `tests/e2e/E2E-VH-HANDOFF.md`: tài liệu này.

Không có file tracked ngoài phạm vi. Log, JSON reporter, trace và script probe nằm trong `test-results/e2e-vh/` (gitignored); Lead cần giữ/copy thư mục này nếu xóa worktree.

## Baseline main: 3 lượt mỗi mức worker

Baseline đã thêm observer chỉ đọc, chưa sửa logic chờ của spec. `BUILD` = timeout pending, `MOVE` = assertion >0.1 m, `STOP` = assertion giữ S thêm 500 ms, `TOTAL` = ngân sách tổng 120 s hết khi đang lái.

| Lượt | Ca | Kết quả | build (ms) | Ca (ms) |
|---|---|---|---:|---:|
| w2-r1 | brake to rest | FAIL BUILD | — | 111383 |
| w2-r1 | E while rolling | FAIL BUILD | — | 110495 |
| w2-r1 | E during mount | PASS | 41950 | 61276 |
| w1-r1 | brake to rest | FAIL TOTAL | 94495 | 122501 |
| w1-r1 | E while rolling | PASS | 25732 | 50813 |
| w1-r1 | E during mount | FAIL BUILD | — | 107468 |
| w2-r2 | brake to rest | FAIL MOVE | 84975 | 113491 |
| w2-r2 | E while rolling | FAIL MOVE | 77510 | 106647 |
| w2-r2 | E during mount | PASS | 93719 | 114812 |
| w1-r2 | brake to rest | FAIL STOP | 22504 | 36260 |
| w1-r2 | E while rolling | PASS | 23605 | 57129 |
| w1-r2 | E during mount | PASS | 70880 | 99412 |
| w2-r3 | brake to rest | FAIL MOVE | 83108 | 113556 |
| w2-r3 | E while rolling | FAIL MOVE | 84596 | 116362 |
| w2-r3 | E during mount | PASS | 55281 | 75300 |
| w1-r3 | brake to rest | FAIL STOP | 24936 | 41991 |
| w1-r3 | E while rolling | PASS | 24258 | 50428 |
| w1-r3 | E during mount | PASS | 25680 | 45660 |

Output tổng kết từng lệnh, tất cả exit 1:

```text
baseline-w2-r1: 2 failed; 1 passed (29.0m; có chờ teardown server như ghi trên)
baseline-w1-r1: 2 failed; 1 passed (4.7m)
baseline-w2-r2: 2 failed; 1 passed (3.9m)
baseline-w1-r2: 1 failed; 2 passed (3.3m)
baseline-w2-r3: 2 failed; 1 passed (3.3m)
baseline-w1-r3: 1 failed; 2 passed (2.3m)
```

## Nguyên nhân và bằng chứng trace

**Test lấy mẫu mà không bảo đảm simulation đã tiến.** Trong trace [brake w1-r2](../../test-results/e2e-vh/baseline-w1-r2/world-vehicle-vehicle-with-329cb-ight-beside-the-parked-bike-msedge/trace.zip), KeyS xuống tại `35793.897`, wait 250 ms tại `35819.105–36097.916`, rồi test chấp nhận quãng đường <0.002 m và thoát poll. Các screencast frame lân cận tại `35641.213` và `36198.430`, cách nhau khoảng 557 ms: cửa sổ lấy mẫu ngắn hơn một frame. Sau wait 500 ms (`36112.689–36624.514`), assertion giữ yên nhận **0.09826836563539892 m**. Lượt w1-r3 nhận **0.03685702685363906 m**. Kết hợp trace, giới hạn timestep và probe dưới đây, nguyên nhân là kết luận đứng yên quá sớm từ mẫu không đồng bộ simulation; trace này không chứng minh xe đã dừng rồi tự lùi.

**Ba giây giữ W/D cũng không phải ba giây simulation.** Trace [MOVE w2-r2](../../test-results/e2e-vh/baseline-w2-r2/world-vehicle-vehicle-with-069af-ight-beside-the-parked-bike-msedge/trace.zip) nhận **0.09824084139052706 m**, cùng giá trị ở cả hai ca lái, lặp lại w2-r3. `src/features/world/timestep.ts:2–7` chỉ cho tối đa 5 bước × 1/60 s mỗi frame, bỏ phần thời gian dư; `src/features/world/index.ts:1265` còn chặn animation dt ở 0.1 s. Với SwiftShader, ngủ 1500/250/500 ms có thể không bao gồm đủ frame.

Probe riêng sau ma trận, cùng browser/viewport/SwiftShader, đọc closure controller bằng DevTools (không gán biến hay thay controller): [probe-motion.json](../../test-results/e2e-vh/probe-motion.json), script cùng tên `.mjs`, log cùng tên `.log`.

- Mounted: model `s=6`, lateral `-2`, speed `0`, vị trí `(11.73515997, -0.88541819)` trên XZ.
- Sau W 1.5 s thực: `s=6.1`, speed `0.75`, vị trí `(11.78327465, -0.97107005)` — chính điểm/quãng đường 0.09824 m của trace fail. Tương ứng chỉ 0.25 s tăng tốc simulation.
- Sau W/D tổng 3 s: `s=6.27083333`, speed `1.25`; sau W tổng 7 s: `s=7.525`, speed `3`. Xe tiếp tục đi, không kẹt ở điểm 0.09824 m.
- Không nằm trong solid mở rộng; sweep 20 cm phía trước không bị chặn; model/physics lệch XZ chỉ khoảng 0.00002 m. Probe nhận `parked` khi bấm E sau đó. Probe này chỉ chẩn đoán chuyển động, không thay cho các assertion tư thế cuối của spec.

Do đó **không có bằng chứng spawn/bãi đỗ sai sau MAP-01 hay hồi quy giữ yên VH-03** trong các lỗi đã tái hiện. Test dùng `nearVehicle()` lấy vị trí xe runtime (`src/features/world/index.ts:528–536`), không có tọa độ map cũ trong spec. Guard VH-03 ở `src/features/world/vehicle/motion.ts:15–19` chỉ giữ khi proposal đứng yên; các sample chuyển động ở trên có speed khác 0. Ca phanh sau sửa PASS với guard nguyên trạng. Không tái hiện timeout riêng ở assertion xuống xe trong 18 ca baseline này; các ca đã đi tới bước đó PASS.

**Còn một vấn đề tải dựng cảnh của app.** Trong [fixed-w2-r1 brake](../../test-results/e2e-vh/fixed-w2-r1/world-vehicle-vehicle-with-329cb-ight-beside-the-parked-bike-msedge/trace.zip) và [rolling](../../test-results/e2e-vh/fixed-w2-r1/world-vehicle-vehicle-with-069af-ight-beside-the-parked-bike-msedge/trace.zip), assertion build giữ `pending` suốt 90 s; `paused=false`, intro done, trang visible/có focus, chưa có KeyE. Observer và DOM snapshot xác nhận điều này. Khi chỉ còn ca thứ ba, done sau 23455 ms và PASS. Baseline cũng dao động 22504–94495 ms hoặc vượt cửa sổ chờ. Không cần giả thiết ba build đồng thời để tái hiện tải này; chính loạt chạy tuần tự trên bản build main cũng gặp.

Điểm phụ thuộc app: `src/features/world/index.ts:164` chỉ phát done khi toàn bộ dressing queue xong; queue ở `src/features/world/dressing.ts:102–114` chạy khoảng 4 ms rồi hẹn timer 16 ms, cạnh tranh main thread với `paper.render` mỗi RAF (`src/features/world/index.ts:1333–1335`). Đã audit cả 12 trace fail mới: không có pageerror/console.error; [trace-audit.json](../../test-results/e2e-vh/trace-audit.json) lưu danh sách. Có cảnh báo thiếu `KHR_parallel_shader_compile`. Bằng chứng chỉ ra contention khi software rendering, chưa profile đủ để quy chi phí cho riêng foliage GFX-P3 hay water GFX-P4. Không kết luận lỗi thuật toán queue hoặc hệ số map từ một timeout.

## Bản sửa test và xác minh

- Đo vị trí sau hai rAF liên tiếp, bảo đảm có world tick giữa các mẫu khi world đang chạy.
- Poll cùng ngưỡng quãng đường **>0.1 m** trong lúc còn giữ W/D, dùng deadline assertion mặc định 5 s; thay cách ngủ đủ 3 s rồi assert ngay.
- Poll phanh vẫn **15 s**, ngưỡng **<0.002 m**; thay cửa sổ 250 ms bằng mẫu qua frame. Giữ kiểm tra giữ S thêm **500 ms**, rồi lấy mẫu qua frame để thật sự kiểm tra không tự lùi.
- Không tăng timeout cấu hình: test **120 s**, build **90 s**, mount/dismount/pose **15 s**; giữ High/full motion, các ngưỡng upright/khoảng cách, kiểm tra lỗi console và mọi assertion hành vi. Không skip thêm ca nào.

| Lượt sau sửa | Ca | Kết quả | build (ms) | Ca (ms) |
|---|---|---|---:|---:|
| fixed-w1-r1 | brake to rest | PASS | 26087 | 54357 |
| fixed-w1-r1 | E while rolling | PASS | 25156 | 49626 |
| fixed-w1-r1 | E during mount | PASS | 24766 | 44861 |
| fixed-w2-r1 | brake to rest | FAIL BUILD | — | 104705 |
| fixed-w2-r1 | E while rolling | FAIL BUILD | — | 106531 |
| fixed-w2-r1 | E during mount | PASS | 23455 | 42131 |

```text
fixed-w1-r1: 3 passed (2.5m), exit 0
fixed-w2-r1: 2 failed; 1 passed (2.5m), exit 1
```

Sáu lượt baseline hoàn tất trước khi sửa; sau sửa chạy một lượt mỗi mức worker. Không báo 3/3 lượt xanh. Phần chưa đạt cần Lead xử lý/đánh giá tải app, không nới timeout test.

## Gợi ý bản vá app cho Lead (chưa áp dụng/chưa kiểm chứng)

Chuyển cho owner tải/render/GFX; không cần sửa vị trí xe, model hoặc guard giữ yên từ bằng chứng hiện có. Thử dành main-thread budget cho dressing trong giai đoạn build pending bằng cách giới hạn tần suất draw, vẫn giữ tick/input/physics chạy và frame đầu tiên. Điểm thử: `src/features/world/index.ts:1333` (thay điều kiện draw hiện tại), thêm timestamp trước tick:

```ts
let lastDeferredDraw = 0;
// Bên trong tick, tại nhánh paper.render hiện có:
const pending = container.dataset.worldBuild === "pending";
if ((canSimulate(state) || cinematicLocked() || redraw)
  && (!pending || cinematicLocked() || redraw || now - lastDeferredDraw >= 250)) {
  paper.render(scene, camera);
  lastDeferredDraw = performance.now();
  redraw = false;
}
```

Đây là phương án cần owner đo CPU/render và kiểm tra hình/intro trước khi áp dụng, không phải bản vá đã chứng minh an toàn UX. Giữ assertion build và các timeout để kiểm chứng cải thiện. Lead không cần nối test vào `index.ts`: Playwright tự discover spec; helper được import ngay trong spec. Không có import app mới cần bàn giao.

## Lệnh và artifact

PowerShell dùng `pnpm.cmd` vì `pnpm.ps1` bị ExecutionPolicy chặn trước khi khởi chạy compiler. Lệnh build thực tế:

```powershell
$env:NEXT_TEST_WASM_DIR='C:\Users\PC-LP\AppData\Local\next-swc\wasm\package'
$env:NEXT_BUILD_WEBPACK='1'
pnpm.cmd build
$env:E2E_PORT='4197'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='test-results/e2e-vh/<label>.json'
pnpm.cmd exec playwright test tests/e2e/world-vehicle.spec.ts --workers=2 --reporter=list,json --output=test-results/e2e-vh/<label>
# Lượt một worker đổi duy nhất --workers=1; mỗi mức có baseline r1/r2/r3.
```

Log đầy đủ: `test-results/e2e-vh/{build,baseline-w*-r*,fixed-w*-r*,lint,typecheck,unit,gate}.log`; JSON reporter cùng label; `summary.json` chứa kết quả, thời gian và toàn bộ diagnostics. Trace nằm trong thư mục label với tên ca như các link trên; attachment `vehicle-diagnostics` nằm trong JSON reporter/trace. Có bản sao 3 trace có sẵn trước ticket tại `preexisting/`, không dùng chúng thay thế kết quả mới.

## Kiểm tra bắt buộc

```text
pnpm build: exit 0 (WASM/webpack; một lần)
pnpm lint: exit 0, 0 errors, 0 warnings
pnpm typecheck: exit 0
pnpm test: exit 0
 Test Files  157 passed (157)
      Tests  1779 passed (1779)
   Duration  74.13s
bash tools/lead/gate.sh .: exit 0
GATE PASS: lint, typecheck,  Tests 1779 passed (1779)
```

Gate chạy unit với 4 worker theo đúng script: 157 file/1779 test PASS, 276.17 s. `git diff --check` sạch. Chưa chạy Lighthouse/full e2e; không build lại; chưa commit. Gate e2e hai worker vẫn chưa xanh như bảng/trace trên, cần Lead tiếp nhận phần tải dựng cảnh trước khi đóng CI gate A.
