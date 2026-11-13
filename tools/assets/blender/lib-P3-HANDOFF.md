# GFX-P3 — cây hướng C

Build ngày 2026-11-13, kiểm tra/bàn giao ngày 2026-11-14. Không commit.

Đã nối cây thư viện vào các batch rừng/đồi và grove First Light qua các factory hiện có. Vị trí, mật độ theo quality, collider và cây elf Roots được giữ. `index.ts` không thay đổi. Gate hình, asset, lint/typecheck/unit đã đạt; **e2e world còn 3 ca xe lỗi cả trên bản P3 và baseline 4180**, nên chưa coi toàn bộ gate nghiệm thu là PASS.

## Thay đổi

- `foliage/library.ts`: tải LOD0/LOD1 sau nhịp mô phỏng đang chơi và một khung đã render; một KTX2 loader/worker pool cho mỗi renderer; cache asset có đếm tham chiếu. Lỗi tải/decoder giữ fallback đầy đủ. Hủy trong lúc đang tải không tiếp tục tải LOD1 hoặc bake vào renderer đã dispose.
- Gộp các primitive gỗ/lá thành một geometry/material cho mỗi biến thể; giữ UV, màu đỉnh, alpha-cutout hai mặt và translucency theo ánh sáng hiện tại. Depth/distance shadow dùng cùng alpha mask. Dùng chung `crownAlpha` với camera fade hiện có.
- Ba batch cho mỗi stand, không thêm draw/pass. Chọn ba thông cho stand đa số thông, ba lá rộng cho stand còn lại; ổn định qua streaming/quality. Coast factory riêng không đổi.
- LOD theo khoảng cách tới bound của batch: High khoảng 38/105 m, Balanced 24/78 m; hysteresis 5/10 m. Impostor xa là quad 2 tam giác hướng camera, atlas bốn azimuth 1024×256 được bake một lần từ chính LOD0. Tắt cast shadow của impostor xa.
- Low khởi động không request/bake P3; chuyển Low phục hồi geometry/material cũ. Các asset đã tải khi chơi High/Balanced được giữ để đổi quality và được giải phóng khi hết consumer.
- Lá rộng: giữ kết cấu cụm/cành của GFX-02, thay các phiến nhọn bằng thẻ lá gập bốn tam giác, mép alpha tròn, nhiều hướng, quanh lõi tán nhiều lớp. Atlas gốc của dự án, CC0-1.0, 256 px. LOD1 bỏ nguyên thẻ/cụm theo seed thay vì decimate UV; bỏ nắp cành bị che để giữ ngân sách. Thông dùng nguyên GLB/atlas Poly Haven 128 px đã có.

## File

Runtime:

- `src/features/world/foliage/library.ts` — mới.
- `src/features/world/foliage/forest-r1.ts`.
- `src/features/world/foliage/first-light-grove.ts`.
- `src/features/world/foliage/instances.ts` — nhịp đang chơi cho binding.

Asset/pipeline:

- `public/world/lib/tree-broadleaf-{1,2,3}-lod{0,1}.glb` — sáu file.
- `public/world/lib/manifest.json`.
- `tools/assets/blender/lib-canopy.py`, `lib-canopy.mjs` — mới.
- `assets/LICENSES.csv` — **file ngoài glob ticket**, sửa đúng sáu dòng của các GLB thay đổi để ghi nguồn/atlas mới; cần thiết theo phần Chung. Không thêm file public mới.

Kiểm thử/bàn giao:

- `tests/unit/world/foliage-library.test.ts` — sáu regression tests.
- `tools/assets/blender/lib-p3-review/`: tám ảnh `before/`, tám ảnh `high/`, Low First Light trong `low/`; hai sheet; `visual-gates.json`, `runtime-metrics.json`, `validation.json`, JSON/Markdown load-budget hai locale.
- `tools/assets/blender/lib-P3-HANDOFF.md` — file này.

Không sửa package/lock/config, docs, e2e/perf source, index, layout, zones, terrain hoặc tính năng của ticket khác.

Đã thử dọn các PNG/trung gian do ticket tạo trong `tmp/p3-*`, nhưng bộ duyệt thực thi tự động từ chối (`blocked by policy`), kể cả lệnh xoá một PNG có đường dẫn cụ thể. Không đổi công cụ để vượt chặn. Các file tạm còn trong thư mục đã gitignore, không đưa vào danh sách commit; bản bàn giao lossless đã được lưu riêng.

## Asset cuối

| Mẫu | Tri LOD0 / LOD1 | Byte LOD0 / LOD1 |
|---|---:|---:|
| pine-a (giữ nguyên) | 1096 / 487 | 27388 / 21272 |
| pine-b (giữ nguyên) | 1096 / 487 | 27176 / 21232 |
| pine-c (giữ nguyên) | 1096 / 487 | 27544 / 21244 |
| broadleaf-1 | 950 / 506 | 29516 / 23148 |
| broadleaf-2 | 950 / 506 | 29496 / 23144 |
| broadleaf-3 | 950 / 506 | 29480 / 23144 |

`public/world`: **1.211.094 → 1.209.686 byte**, giảm **1.408 byte** gồm manifest; `startBytes=147096` không đổi. KTX2 có mipmap, meshopt required. Không tải ngoài/thêm dependency. Thư viện public tổng 499.203 byte; 28 GLB tổng 487.440 byte.

## Hình và geometry

Ảnh High 1600×900 đủ tám khu, cùng camera của `ingame-shots.mjs`; Low First Light riêng. Lượt ảnh cuối dùng Edge headless D3D11 và giữ focus qua CDP vì helper Windows UI không kết nối được. Đã xem sheet tám khu và ảnh chi tiết. 17 khung gốc được giữ bằng WebP **lossless**; sheet là ảnh xem nhanh. Ảnh review không thuộc payload world.

| Khu | Luma trước | Sau | Delta | Sky-fraction sau |
|---|---:|---:|---:|---:|
| First Light | .225 | .223 | -.002 | **0.11% PASS** |
| Workshop | .266 | .262 | -.004 | **5.32% PASS** |
| Roots | .312 | .311 | -.001 | **14.90% PASS** |
| Milestones | .237 | .236 | -.001 | **1.00% PASS** |
| Old Trail | .438 | .428 | -.010 | 9.45% |
| Horizon | .428 | .425 | -.003 | 29.17% |
| Quiet Shore | .315 | .315 | .000 | 3.65% |
| Last Postcard | .336 | .335 | -.001 | 4.51% |

Sky gate giữ nguyên classifier/crop top 45%, giới hạn 15% cho bốn khu rừng. Baseline chụp ở 4180 có Roots 16.41%; không sửa classifier, crop hoặc bỏ UI. Các số chưa làm tròn nằm trong `visual-gates.json`.

Đếm trực tiếp WebGL draw trong các khung High ổn định, gồm bóng/hậu kỳ, trước 4180 và sau 4195; không page/shader console error:

| Khu | Tri trước → sau | Tăng | Draw trước → sau |
|---|---:|---:|---:|
| First Light | 319609 → 391715 | 22.56% | 177 → 177 |
| Workshop | 308205 → 377563 | 22.50% | 186 → 186 |
| Roots | 303938 → 356678 | 17.35% | 98 → 98 |
| Milestones | 282003 → 334505 | 18.62% | 66 → 66 |
| Old Trail | 226289 → 240664 | 6.35% | 76 → 76 |
| Horizon | 220332 → 226946 | 3.00% | 85 → 85 |
| Quiet Shore | 219253 → 219253 | 0% | 84 → 84 |
| Last Postcard | 173023 → 173023 | 0% | 44 → 44 |

Đây là tam giác thực submit tại các góc review, không phải tổng geometry resident không nhìn thấy. Max tăng 22.56% < 25%; không thêm pass. Raw số đo ở `runtime-metrics.json`.

## Lệnh

```text
pnpm.cmd lint                         exit 0 — eslint ., 0 errors / 0 warnings
pnpm.cmd typecheck                    exit 0 — tsc --noEmit
pnpm.cmd test --maxWorkers=1           exit 0
 Test Files  154 passed (154)
      Tests  1789 passed (1789)
   Duration  464.36s
pnpm.cmd check:assets                 exit 0 — PASS, worldBytes=1209686, errors=[]
pnpm.cmd check:licenses               exit 0 — public files=68, RESULT: PASS
git diff --check                      exit 0
pnpm.cmd build                        exit 0 — compiled successfully in 12.8s
```

Build **một lần** với `NEXT_TEST_WASM_DIR=C:\Users\PC-LP\AppData\Local\next-swc\wasm\package`, `NEXT_BUILD_WEBPACK=1`. Mã TypeScript đã xong trước build. Các vòng sửa asset sau đó chỉ copy sáu GLB + manifest từ public vào out để QA đúng payload mới; không build lần hai. `out` và public GLB cuối được kiểm tra khớp trước bàn giao.

Lượt unit mặc định và hai worker gặp timeout khi chạy cùng các tác vụ khác; không sửa timeout/config/test cũ. Lượt tuần tự trên toàn bộ suite phía trên đã pass. Sáu test mới kiểm tra file thật/budget/alpha/KTX2, transform/UV/gỗ-lá, hysteresis, deferred/refcount/fade/Low, lỗi decoder và dispose trong lúc tải.

`pnpm.cmd test:perf load-budget`: lượt cuối **exit 0, 2 passed (1.2m)**, en/vi mỗi locale ba browser/context lạnh, 10 Mbps/RTT 100 ms. Worst **6.83 s** (trần 10 s), **2.090.907 byte** Enter World → playable, **0 request 3D trước Enter World**. Máy đo: i5-14400F, 32 GB, RTX 3060, Edge 157, headless D3D11, không CPU throttle. Raw JSON/Markdown cuối ở `lib-p3-review/load-budget{,-vi}.{json,md}`. Không suy ra FPS Iris Xe từ phép đo này.

Có biến thiên trên máy dùng chung: một lượt trước đạt 7.17 s nhưng tiến trình chờ dọn server Windows; đã ngắt sau khi cả hai test in PASS. Lượt tiếp theo chạy cùng lint/typecheck có một cold run 12.06 s nên FAIL; giữ nguyên log `tmp/p3-load-budget-reuse.log`. Lượt cuối chạy riêng, dùng gzip server khởi động riêng ở 4316 để tránh vướng cleanup, không nới gate/throttle/timeout và đã exit 0 (`tmp/p3-load-budget-clean.log`).

E2E đã chạy toàn bộ `world.*\.spec\.ts --workers=2`: **40 passed, 3 failed**. Chạy riêng `world-vehicle.spec.ts --workers=2` trên P3: cùng ba ca fail. Chạy nguyên spec trên baseline **4180**: cả ba cũng fail, chờ `data-world-build=done`/đợi xuống xe. Không sửa tính năng xe/harness ngoài scope. Log và trace P3 ở `tmp/p3-e2e-world.log`, `tmp/p3-e2e-vehicle-retry.log`, `tmp/p3-vehicle-retry-evidence/`; baseline ở `tmp/p3-e2e-vehicle-baseline.log`. **Lead cần xử lý/xác nhận blocker baseline này trước khi chốt toàn bộ gate.**

## Lead nối vào index

Không cần thêm dòng mới: binding nằm trong các factory compose đang gọi. Giữ import/lời gọi đang có (hai dòng):

```ts
import { updateFoliageWind } from "./foliage/instances";
updateFoliageWind(composed.foliageMeshes, animDt, reducedMotion);
```

`animDt > 0` mở tải cho đúng Scene; intro/pause hoặc render tĩnh không mở tải. Grove First Light dùng cùng Scene nên không cần đưa thêm mesh vào danh sách index.

## Chạy lại và giới hạn

Chạy `lib-canopy.py` qua `execute_code` trên Blender MCP **9876**, không reset scene. `ROOT` hiện trỏ W-A; khi đổi checkout thì đổi ROOT trước khi chạy. Script tạo scene riêng, khôi phục scene trước và dọn dữ liệu mới, ghi trung gian vào `tmp/p3-library`. Sau đó chạy `node tools/assets/blender/lib-canopy.mjs` từ gốc repo. Không ghi đè `assets/lib/library.blend`, không cần raw asset bên ngoài. Pipeline dedicated original leaf atlas/geometry CC0 như GFX-02.

Giữ roof FL-03 làm lớp che nền, Low và các factory coast/biome feather hiện có. Lõi tán vẫn có thể lộ facet khi nhìn gần; atlas dùng độ phân giải nguồn 128/256 px, không upsample thành chi tiết giả. Vỏ cây mới hiện là vertex pigment; nếu P2 nối bark map vào material gộp, `librarySurface=0` là gỗ, 1 là lõi lá, 2 là lá có texture. Impostor dùng ánh sáng bake, hue instance và fog; không thay thế đánh giá chuyển LOD trong mọi góc nhìn.

Đã chạy một cặp `cpu-compare.mjs` High (bản QA headless D3D11 giữ focus), 4 giây đi bộ mỗi khu: ScriptDuration First Light **288 → 320 ms/s**, Roots **246 → 290**, Workshop **414 → 335**; trung bình ba điểm **316 → 315 ms/s**. Đây **không phải ABBA**, hai điểm đơn vượt +10 ms/s; **không xác nhận CPU gate từ phép đo này**. Log ở `tmp/p3-cpu-{before,after}.log`. CPU ABBA sau merge và FPS/GPU trên máy Iris Xe nghiệm thu vẫn để Lead theo phần Chung. Không chạy Lighthouse/full e2e ngoài nhóm world. Không lưu localStorage/sessionStorage/cookie/URL.
