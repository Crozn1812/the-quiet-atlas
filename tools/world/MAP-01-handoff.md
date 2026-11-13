# MAP-01 — Bàn giao (ADR 0017)

Ngày 2026-11-13. Không commit. Giữ nguyên tốc độ đi bộ 3 m/s, tốc độ chạy, thứ tự 8 khu, ba biome, kích thước đạo cụ và bề rộng đường.

## Kết quả đo

`node tools/world/layout-audit.mjs --baseline` đọc HEAD qua Vite; không checkout/revert file. `node tools/world/layout-audit.mjs` đo working tree.

| `secondsToZone(id)` (giây) | HEAD | MAP-01 |
|---|---:|---:|
| first-light | 0.000 | 0.000 |
| workshop | 51.773 | 33.357 |
| roots | 70.263 | 45.270 |
| milestones | 86.905 | 55.992 |
| old-trail | 184.904 | 119.132 |
| horizon | 281.053 | 181.081 |
| quiet-shore | 329.128 | 212.055 |
| last-postcard | 369.807 | 238.264 |

- `routeSeconds()`: **369.80710780587947 → 238.26422953544682 s**.
- `pathLength()`: **1109.4213234176384 → 714.7926886063404 m** (giảm 35.57%).
- Khoảng cách nhỏ nhất giữa hai tâm khu: **49.918562719549 → 32.16388711330533 m**, lớn hơn 25 m.
- `WORLD_SCALE = 0.64`, `WORLD_LENGTH = 576 m`; giữ nguyên `t` của các khu.
- Các số này đo tuyến chính liên tục, không dừng đọc/cinematic/detour; không phải phép đo đi hết tuyến bằng phím thật RC-01.

## File sản phẩm và công cụ

Các đường dẫn dưới đây tương đối với gốc worktree.

| File | Thay đổi |
|---|---|
| `src/features/world/layout/scale.ts` (mới) | Nguồn tỷ lệ duy nhất, chiều dài, `routeZ`, mốc cát và bờ biển. |
| `src/features/world/layout/river.ts` | Thu X và Z của các control point từ cùng tỷ lệ. |
| `src/features/world/layout/path.ts` | Giữ chiều dài thực tính bằng mét của hai đoạn qua cầu. |
| `src/features/world/art/direction.ts` | Fog xa và mist xa theo kích thước world; giữ recipe màu. |
| `src/features/world/terrain/height.ts` | Dời vùng biển/estuary, giữ độ cao nguồn suối, nền Workshop khô, bờ ghế khô, dời cảnh ven biển dọc theo tuyến. |
| `src/features/world/terrain/detail.ts` | Shader đọc chung mốc cát đã thu tuyến. |
| `src/features/world/terrain/mesh.ts` | CPU pigment và độ khô đọc mốc theo world; thống nhất với shader. |
| `src/features/world/scene/far-landscape.ts` | Dời vùng phủ theo cửa sông, giữ khoảng đệm cảnh xa. |
| `src/features/world/foliage/scatter.ts` | Kiểm footprint thực của cụm lá để bảo vệ các pad gần nhau; giữ đa số tán xanh sâu trên trường cây ven biển ngắn hơn. |
| `src/features/world/water/ribbon.ts` | Tìm điểm nhập biển sớm hơn trên map ngắn, xét cả tam giác terrain hiển thị; cache phép dò tĩnh. |
| `src/features/world/waymarks.ts` | Giữ khoảng cách biển đường 35 m thay vì `t` cũ. |
| `src/features/world/zones/horizon.ts` | Ghế nhìn về cửa sông hiện tại. |
| `src/features/world/road/road.ts` | Ô dọc 0.7 m thay 0.8 m để mặt đường trên khúc cong mới giữ khoảng hở và sai số drape dưới 10 cm; không tăng draw call. |
| `tools/world/layout-audit.mjs` (mới) | In thời gian, vị trí, khoảng cách khu và mẫu sườn núi; hỗ trợ HEAD / baseline-root mà không đổi checkout. |
| `tools/world/MAP-01-handoff.md` (mới) | Bàn giao này. |

Không sửa năm file PERF-FL03; không sửa `index.ts`, package/lockfile, config, docs, app/components, public/world, tests/e2e hay tests/perf. Không thêm dependency/asset, không lưu progress.

## Từng file test đã đổi và lý do

Tất cả đường dẫn trong bảng nằm dưới `tests/unit/`. Các snapshot/hash đã đổi có chủ đích vì ADR 0017 dời tọa độ và ô lưới 2 m; không gọi chúng là baseline cũ bất biến.

| File | Lý do |
|---|---|
| `world/layout.test.ts` | Khóa mục tiêu ADR 0017: 200–240 s, Workshop 25–45 s, Roots/Milestones ≤60 s; giữ đo độc lập arc length và mọi cặp khu ≥25 m; cập nhật chiều dài và biên độ X. |
| `tools/styleframes.test.ts` | Mẫu đỉnh núi theo sườn đã dời; giữ mức chênh cao ≥30 m. |
| `world/coast-mountains.test.ts` | Station dọc núi/cape theo scale; snapshot sườn mới. Giữ các giới hạn cao núi, góc dốc và tính liên tục. |
| `world/coast-shape.test.ts` | Mẫu vịnh và núi theo tuyến mới; khóa lại nền/luồng ở vị trí mới; giữ giới hạn dốc, đường khô, ray nhìn ra biển và sai số 5 cm trên đường (epsilon số thực). |
| `world/coast.test.ts` | Dời miền dò bờ biển, mẫu pigment; thay giao điểm bờ cũ bằng phép chia đôi tại bờ mới. |
| `world/compose.test.ts` | Fog xa theo scale; epsilon cho near-fog khi phép chiếu đường trả t lệch rất nhỏ. |
| `world/direction.test.ts` | Kỳ vọng fog xa theo scale; giữ các kiểm tra palette/khí quyển khác. |
| `world/ending-estuary.test.ts` | Miền ribbon giữ nước upstream kết thúc tại điểm nhập biển thực, không dùng 0.95 cũ. |
| `world/far-landscape.test.ts` | Khóa lại hash vertex/normal/pigment của miền cảnh xa đã dời; giữ cap tam giác/draw và kiểm tra kín mép. |
| `world/foliage-canopy.test.ts` | Kiểm ba phần sườn biển theo vị trí vật lý: map ngắn làm cây xa chiếu lên khúc cong trước. Giữ độ phủ ≥85%, khoảng cách cây và ngân sách. |
| `world/foliage-forest.test.ts` | Số mẫu và số đoạn theo chiều dài mới; tỷ lệ che phủ so với HEAD đo trên cùng miền mẫu; giữ kiểm tra pad trống/cành không đè nền. |
| `world/foliage-natural.test.ts` | Số bụi theo tuyến ngắn; kiểm đa số tán sâu trên toàn quần thể và màu đúng cohort mà từng quality chọn (Low chỉ còn một mẫu nhỏ). |
| `world/foliage-trail-canopy.test.ts` | Bỏ số tam giác chính xác của trường cây dài cũ; giữ geometry >0, cap cũ và số slot mesh. |
| `world/ground.test.ts` | Mẫu ô cây/cỏ có seed đổi khi pad gần hơn; cập nhật số lượng và số instance hiển thị theo scale, giữ cap tam giác. |
| `world/quiet-shore-cliff.test.ts` | Mẫu bờ khô dịch 16→18 m do đoạn easing mới; đọc màu nội suy tại điểm ray hit thay vì một góc tam giác bất kỳ. Giữ màu ấm, tránh pigment đường/cỏ; khoảng luma nội suy 0.24–0.36. |
| `world/railing.test.ts` | Epsilon 1e-10 cho chiều dài rào 7.2 m, không đổi yêu cầu vật lý. |
| `world/river-source.test.ts` | Công thức mực nước giữ độ cao đầu/cuối khi thu Z; miền upstream dừng theo điểm nhập biển thực. |
| `world/river-terrain.test.ts` | Mẫu hill t=0.12 tránh khúc cong đối diện nay gần hơn; giữ rise 2–12.5 m và mọi kiểm tra độ dốc/đường/cầu. |
| `world/road.test.ts` | Ít cột hơn do đường ngắn nhưng giữ khoảng cách mét; giữ cap 14k tam giác, 4 draw, ray hở >5 mm, sai số drape <10 cm. |
| `world/sky.test.ts` | Fog Horizon theo scale; giữ diễn tiến ánh sáng và luma tham chiếu CPU. |
| `world/terrain-banks.test.ts` | Khóa lại digest nền rừng/đường/khu trên tuyến mới; giữ bờ <35°, đường khô và các kiểm tra 5 cm/độ liên tục. |
| `world/terrain-landmarks.test.ts` | Khóa cao độ/mẫu đồi mới do seed/vị trí đổi; mốc biển theo length, crest vẫn xa đường và mọi pad khô. |
| `world/terrain-mesh.test.ts` | Miền độ khô theo scale và hash pigment đường ven biển mới. |
| `world/water.test.ts` | Điểm nhập biển thực; epsilon Float32 cho bounds; hash mới của 109 mẫu bờ biển; giữ quad/draw và các kiểm tra nước. |
| `world/waymarks.test.ts` | Mẫu `t` suy ra từ khoảng cách 35 m; giữ khoảng cách 30–45 m, nền khô và tránh pad. |
| `world/zones/milestones.test.ts` | Placement search chọn vai khô gần hơn trên khúc cong ngắn; vẫn giữ target trong tầm tương tác. |
| `world/zones/quiet-shore.test.ts` | Điểm nhìn ra biển lấy từ endpoint mới, giữ ray không bị đạo cụ che. |

## Kết quả lệnh và ảnh

Chi tiết log/ảnh nằm tại `test-results/map01-review/` (gitignored, không commit).

Đã chạy:

```text
pnpm lint --max-warnings=0
  exit 0 — 0 errors, 0 warnings (lint.txt)
pnpm typecheck
  exit 0 — tsc --noEmit (typecheck.txt)
pnpm test --configLoader runner --maxWorkers=4
  Test Files  152 passed (152)
       Tests  1755 passed (1755)
  Duration 175.32s — exit 0 (test-final.txt)
bash tools/lead/gate.sh .
  GATE PASS: lint, typecheck,  Tests 1755 passed (1755)
  exit 0 — loader fallback nêu bên dưới (gate.txt)
NEXT_TEST_WASM_DIR="C:\Users\PC-LP\AppData\Local\next-swc\wasm\package" NEXT_BUILD_WEBPACK=1 pnpm build
  Compiled successfully in 42s
  Generating static pages using 12 workers (22/22) in 2.3s
  PDF CV và OG đã sinh xong — exit 0 (build.txt)
```

Chỉ gọi build **một lần**. Lượt gate đầu chạy cùng e2e/render trượt timeout contract 30 s và đo dựng Roots 273 ms >200 ms; không sửa hai test này. Chạy lại gate khi đã dừng tải song song đạt toàn bộ (122.36 s). Bằng chứng lượt đầu giữ ở `gate-first.txt` và `gate-unit-first.txt`.

E2e thực chạy với `E2E_PORT=4191`:

```text
pnpm exec playwright test 'world.*\.spec\.ts' 'q15.*' full-viewport --workers=2
  Lượt 1: 1 failed, 51 passed (7.7m), exit 1 — e2e-first.txt
  Lượt 2: 2 failed, 50 passed (6.6m), exit 1 — e2e-second.txt
```

- Lượt 1 trượt assertion phanh đứng yên `world-vehicle.spec.ts:57`: sau khi dừng xe còn trôi 0.0163755 m, ngưỡng <0.002 m. Lượt 2 hai ca xe timeout 90 s ở chờ `data-world-build=done`; các spec còn lại qua.
- Chạy riêng `pnpm exec playwright test world-vehicle --grep 'brake to rest' --workers=2`: MAP-01 trượt cùng assertion, 0.0738036 m; log `e2e-brake.txt`, trace `e2e-brake-failure/`.
- Đối chiếu chính lệnh đó với `E2E_PORT=4180` (main đang phục vụ): **main cũng trượt cùng assertion, 0.2112317 m**; log `e2e-brake-main.txt`, trace `e2e-brake-main-failure/`. Đây là lỗi tái hiện trên main, không ghi e2e của MAP-01 là PASS. Không sửa điều khiển xe hay nới test trong ticket thu ngắn tuyến.
- Chạy riêng `pnpm exec playwright test world-vehicle --grep 'E while rolling' --workers=2`: **1 passed (52.9s), exit 0**, `e2e-rolling.txt`. Như vậy 51/52 ca đã có lượt PASS; ca phanh còn FAIL trên cả MAP-01 và main.
- Đã qua đi bộ bằng phím thật tới Workshop, hai locale của ghế Horizon và lan can cuối, journal, intro, context loss, menu, đổi ngôn ngữ và entry/exit.

Ảnh (cùng locale `vi`, 1600×900):

- Main tại cổng 4180: `TQA_QUALITY=high node tools/review/ingame-shots.mjs test-results/map01-review/main http://127.0.0.1:4180 vi` — đủ 8 khu, exit 0.
- MAP-01 tại cổng 4191: cùng lệnh, output `test-results/map01-review/after`, `quality: high` — đủ 8 khu, exit 0. Chụp lại lần cuối khi không còn wide-shot giành focus; `shots-after-final.txt`.
- `node tools/review/wide-shots.mjs http://127.0.0.1:4191 <zone> test-results/map01-review/wide/<zone>` cho First Light/Horizon/Last Postcard — cả 3 exit 0, tổng 9 PNG; `wide.txt`, `wide-sheet.jpg`.
- `node tools/review/intro-shots.mjs test-results/map01-review/intro http://127.0.0.1:4191` — exit 0, 8 PNG; `intro-sheet.jpg`. Đã xem: không thấy mép terrain/khoảng trống.
- `node tools/review/ending-shots.mjs test-results/map01-review/ending http://127.0.0.1:4191` — `visits [ true, true, true, true ]`, exit 0, 9 PNG; `ending-sheet.jpg`. Đã xem cả khung biển xa và handoff: không thấy mép terrain/khoảng trống.
- `node tools/review/luma.mjs test-results/map01-review/main` và `.../after` — exit 0; `luma-main.txt`, `luma-after.txt`.
- `node tools/review/ground-hue.mjs test-results/map01-review/after` — exit 0; `ground-hue-after.txt`.

Đo tải cuối: khởi động riêng `node tools/load-budget/serve-gzip.mjs out --port 4209`, rồi `PERF_PORT=4209 pnpm test:perf load-budget --output=test-results/map01-review/perf-final-artifacts` (3 cold loads mỗi locale, 10 Mbps / RTT 100 ms, Edge hardware RTX 3060, không phải máy Iris Xe nghiệm thu):

- **`2 passed (1.0m), exit 0`**, log `load-budget-final.txt`.
- `/en/`: 5.8255 / 5.9203 / 5.6764 s; `/vi/`: 5.6259 / **5.9534** / 5.7345 s. Xấu nhất **5.9534 s <6 s**.
- Bytes tới playable: **2187889 B (2.09 MiB)** ở cả sáu lần; 0 request 3D trước Enter World. Welcome/Quick gzip JS <150 KiB.
- Tool dùng ngưỡng 10 s theo ADR 0015; lượt cuối cũng đạt mốc chặt hơn 6 s của `_graphics-common.md`, không sửa config hay ngưỡng. JSON/Markdown sáu cold load nằm trong `test-results/load-budget/` (EN và VI tách file).
- Lượt trước tại cổng 4207 đã ghi đủ sáu mẫu: xấu nhất 6.29 s EN / **6.36 s VI**, vượt mốc 6 s. Sau hai test PASS theo ngưỡng 10 s, runner kẹt teardown server, đã dừng bằng Ctrl-C (exit 1); số đo giữ trong `load-budget.txt` / `load-budget-first.txt`. Lượt cuối dùng server khởi động ngoài runner để lấy exit code sạch. Độ dao động và biên 6 s hẹp vẫn cần Lead lưu ý khi đo máy nghiệm thu.
- Hai lần khởi động server trước đó không thực hiện phép đo vì cổng 4192 bị chiếm, 49817 bị Windows từ chối bind; đổi sang 4207 rồi chạy đầy đủ.

### Luma ảnh High trước/sau

| Khu | Main | MAP-01 | Δ | Ngưỡng chung ±0.03 |
|---|---:|---:|---:|---|
| First Light | 0.225 | 0.224 | -0.001 | Đạt |
| Workshop | 0.262 | 0.277 | +0.015 | Đạt |
| Roots | 0.313 | 0.312 | -0.001 | Đạt |
| Milestones | 0.238 | 0.249 | +0.011 | Đạt |
| Old Trail | 0.438 | 0.364 | -0.074 | **Vượt ngưỡng** |
| Horizon | 0.427 | 0.486 | +0.059 | **Vượt ngưỡng** |
| Quiet Shore | 0.313 | 0.323 | +0.010 | Đạt |
| Last Postcard | 0.336 | 0.341 | +0.005 | Đạt |

Old Trail/Horizon vẫn lệch sau khi chụp lại độc lập; đây không được ghi PASS theo ngưỡng luma chung. Cây/đồi/bóng và fog nay chiếm phần ảnh khác khi tọa độ thế giới thu lại; recipe palette và ánh sáng theo tiến độ không đổi. Cần Lead duyệt hai cảnh này hoặc dành lượt chỉnh hình riêng. Không chỉnh exposure theo vùng để ép thống kê ảnh và không build lần hai ngoài quy tắc ticket.

### Hình học

- Trường foliage High bán kính 240 m: **894407 → 661291 tam giác**, mesh slots **10 → 10**, cây **1676 → 1335**; draw đang hoạt động trên các tile **1186 → 782**. Baseline tam giác cũ có trong test trước MAP-01; số sau do unit test in ra.
- Độ phủ tán sườn biển trên hai pha grid: **93.20% / 93.47%**, giữ ngưỡng ≥85%; khoảng cách cây ≥4 m và không có bốn cây thẳng hàng đều.
- Far landscape **42872 tam giác / 1 draw**, dưới cap 51200 cũ; 402 crown. Không có asset mới; payload `public/world` không đổi.
- Đường nhựa vẫn ≤14000 submitted triangles và 4 draw; các kiểm tra mesh phía trên terrain >5 mm, đoạn cuối trong 3 cm, ghế/lan can và đường đi khô đều qua.

## Lead nối vào index.ts (≤15 dòng)

`index.ts` vẫn có mốc âm biển `z + 880` tại `publishAmbience`. File này thuộc phần Lead nối theo `_common-b2.md`; nguồn mốc đã có sẵn. Thay import và biểu thức tương ứng:

```ts
import { COAST_BEACH_Z } from "./layout/scale";
// Trong object truyền ambienceMixAt:
distanceToSea: Math.hypot(
  Math.max(0, z - COAST_BEACH_Z),
  Math.max(0, y - HEIGHT - waterLevelAt(z)),
),
```

Các consumer còn lại đọc path/river/ZONES sẵn nên tự đi theo layout, không cần nối thêm vào index.

## Giới hạn

- **Chưa đủ mọi điều kiện nghiệm thu:** e2e còn lỗi phanh tái hiện trên main và luma Old Trail/Horizon vượt ±0.03. Lint/typecheck/unit/gate/build/load-budget là PASS riêng, không được diễn giải thành PASS toàn ticket. Lượt tải cuối đạt 5.9534 s, lượt trước có mẫu 6.36 s: biên 6 s hẹp và còn dao động.
- Cần Lead áp đoạn âm thanh trên: nếu để nguyên index, âm biển còn dùng bờ Z của map cũ.
- Chưa đo lại RC-01 toàn tuyến bằng phím thật; không suy ra phép đo đó từ unit test. E2e đi tới Workshop và ghế Horizon là phép kiểm tra tương tác cục bộ.
- Benchmark GPU Iris Xe, Lighthouse và full e2e để Lead. Không có thay đổi việc update/shader mỗi frame; chỉ dữ liệu layout và bước dựng tĩnh.
- Artifact cũ `test-results/map-01/` chứa bản sao HEAD `.ts` làm TypeScript quét nhầm và lỗi lint ở script tạm. Đã chuyển nguyên thư mục sang `node_modules/.map01-previous-review/` để giữ lại bằng chứng mà không đổi config. `Microsoft/` untracked có từ trước, không thuộc ticket và không sửa.
- Cache Vite `.vite-temp` từ phiên trước không ghi được trong sandbox. Unit dùng `--configLoader runner`; gate dùng Bash function chuyển duy nhất lệnh `pnpm exec vitest` sang cùng loader, không sửa gate/không bỏ check.

Để lặp lại gate trong Git Bash với cùng fallback:

```bash
pnpm() {
  if [[ "$1" == exec && "$2" == vitest ]]; then
    command pnpm "$@" --configLoader runner
  else
    command pnpm "$@"
  fi
}
export -f pnpm
TMPDIR="$PWD/test-results/map01-review" bash tools/lead/gate.sh .
```
