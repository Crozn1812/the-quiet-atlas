# MS-C2 return 1 — bàn giao

Tiếp tục worktree được chuyển giao trên `c8531eb`. Không commit. Tất cả file tracked/untracked bàn giao nằm trong phạm vi `MS-C2.md` / `MS-C2-return1.md`; không sửa index, character, post, content, config hay dependency.

Gate **PASS**. CPU cuối **PASS −10,94 ms/s** với world chung đã warm, nhịp reviewer 60 Hz. Unit riêng **37/37**, gồm nguyên 17 test bất biến; full unit sau khôi phục **1.870/1.870**, exit 0 (hai worker, `--retry=1`). Lint **0 warning / exit 0**, typecheck **exit 0**; e2e world **43/43, exit 0**, config mặc định, hai worker. Build duy nhất đã hoàn tất trước mất điện; giữ export và bằng chứng đã kiểm tra lại.

## Kết quả

- Dùng `public/world/character/character-duy-c.glb` và clip Walk của rig 19 xương tại **0,18 s** làm gốc. Giữ bước chân, thêm đánh tay nhẹ đối hướng và đầu cúi 7°. Thân tĩnh cao **5,9 m**, **6.798 tam giác**, không skeleton/animation runtime. Vai, tay, bàn tay và giày được remesh/làm mịn; áo/cổ và quần dài rộng được dựng tiếp trên dáng nhân vật gốc. Thay nguyên đảo mesh áo/cổ để không tạo mép hở khi remesh.
- Subdivision áo/quần và high-poly nếp vải được bake thành tangent normal **512²**. Mesh hiển thị giảm từ khoảng 10.800 xuống 6.800 tam giác; hình dáng/nếp vải được kiểm tra lại ở cả trước, sau và góc khe.
- Giữ mặt điêu khắc vô danh, mắt khép và kính mảnh; sứ trắng ấm roughness 0,83, fill giả SSS và pigment AO theo vùng. Mạng nứt vàng được bake thành mask **1024²**, thay phép Voronoi 9 ô trên từng fragment. Kính vẫn dùng PBR + Fresnel + IBL, không transmission.
- Kính dày 0,115 m, bevel, viền vàng. Chữ canvas serif vàng nhạt có cạnh tối mảnh; atlas giảm 1024 xuống 512 px chiều ngang để bỏ tỷ lệ chữ kéo hẹp. Mặt kính/chữ đặt phẳng hướng trước, không uốn theo từng nếp áo; giảm thêm 1.016 tam giác chữ. Nội dung/số mảnh vẫn chỉ từ `milestoneCertificates()`.
- Khe dự định là lỗ ngũ giác xuyên thật, có thành tối và viền vàng; giữ tầm E/collider. Bàn chân rộng hơn vẫn nhường tia click hướng vào vùng E cũ cho plinth; tia camera/visibility hữu hạn giữ hình học thật.
- Ribbon và points giữ **hai draw riêng**, dùng **chung một shader/material/program**. Chuyển động chỉ đổi một uniform time; tĩnh khi reduced motion, tab ẩn, Low hoặc người chơi ngoài 12 m. Ngoài 30 m ẩn cả ribbon/points. Không raycast vật trang trí, không tìm player bằng traverse mỗi frame, không tạo array/object trong update. Cố định cả world matrix sau lần đặt đầu.

## File

| File | Vai trò |
|---|---|
| `src/features/world/zones/milestones.ts` | Sampling nước hẹp; nhường click E cho plinth với chân mới |
| `src/features/world/zones/milestones-statue.ts` | Vật liệu, atlas, deferred textures, shared light shader, culling/motion/dispose |
| `src/features/world/zones/milestones-statue-geometry.ts` | Giữ pigment/UV khi cắt; thành tối khe xuyên |
| `public/world/milestones/character-milestones-walk.glb` | Bake tĩnh từ nhân vật game, 229.320 B |
| `public/world/milestones/cloth-normal.png` | Nếp vải bake 512² |
| `public/world/milestones/kintsugi-mask.png` | Mask nứt bake 1024², 118.315 B |
| `assets/LICENSES.csv` | Provenance cho ba asset project-original |
| `tests/unit/world/zones/milestones-invariants.test.ts` | 17 bất biến phục hồi, giữ nguyên các ngưỡng |
| `tests/unit/world/zones/milestones-statue.test.ts` | Asset/UV, khe, shared ownership, motion/far/hidden/Low, late textures |
| `tools/assets/blender/milestones-sculpt.py` | Dựng tiếp trên pose game, subdivision, normal bake và mesh display |
| `tools/assets/blender/milestones-bake.mjs` | Freeze rig, ghi joint pose, đóng GLB và bake mask PNG |
| `tools/assets/blender/milestones-budget.mjs` | So đầy đủ dressing LOD1 với `00e1850^`, tính cả points/ba asset |
| `tools/assets/blender/milestones-review.mjs` | Reviewer hình học/IBL; baseline đọc Git; kiểm tra chương trình shader |
| `tools/assets/blender/milestones-cpu-review.mjs` | Công cụ đối chứng khu riêng; không dùng làm gate CPU cuối |
| `tools/assets/blender/milestones-full-world-cpu.mjs` | Đo nhiều context và diagnostic render/raycast; giữ các kết quả fail |
| `tools/assets/blender/milestones-shared-world-cpu.mjs` | Gate ABBA cuối, cùng world/renderer đã warm và cadence 60 Hz |
| `tools/assets/blender/milestones-world-review.mjs` | Ảnh/clip production, trim 10 s bằng ffmpeg cài sẵn |
| `tools/assets/blender/milestones-c2-handoff.md` | Bàn giao này |

Không có file ngoài phạm vi. Bàn giao cũ được giữ tại `tmp/ms-c2/prior-c2-handoff.md` để đối chiếu, không dùng làm kết quả của lượt này.

## Ngân sách

`node tools/assets/blender/milestones-budget.mjs`: **exit 0, pass: true**.

| Toàn khu | Tam giác | Color draw | Asset thêm so pre-MS-C |
|---|---:|---:|---:|
| Pre-MS-C Low | 3.058 | 6 | 0 |
| Pre-MS-C High, dressing LOD1 đầy đủ | 4.131 | 6 | 0 |
| Cuối Low | 9.765 | 7 | 650.631 B |
| Cuối High, dressing LOD1 đầy đủ | 11.798 | 9 | 650.631 B |
| Delta High | **+7.667** | **+3** | **650.631 B** |
| Trần | +25.000 | +4 | 1.500.000 B |

Tượng riêng High: **9.464 tam giác / 4 draw**; Low bỏ 960 tam giác ribbon và hai draw trang trí. Shader program của ribbon/points chỉ có một bản trong reviewer. JSON: `test-results/ms-c2/budgets.json`.

## CPU ABBA cuối

`node tools/assets/blender/milestones-shared-world-cpu.mjs`: **exit 0**. A dùng factory chính xác từ `00e1850^`, B dùng code/asset cuối. Cùng terrain, Rapier, post/bloom, SURF, player, environment và dressing. Cả hai factory được warm 15 s trong **cùng world/renderer** trước đo; nhánh ẩn không render/raycast/update. Đăng ký traversal giống nhau cho cả A/B. Không sửa source index; Vite chỉ thay factory trong bộ nhớ.

| Mẫu | Script ms/s | Task ms/s | FPS |
|---|---:|---:|---:|
| A1 | 170,88 | 188,69 | 60,03 |
| B1 | 165,01 | 180,67 | 60,09 |
| B2 | 147,86 | 160,86 | 60,14 |
| A2 | 163,86 | 180,32 | 60,04 |
| Mean B − mean A | **−10,94** | **−13,74** | |

Delta quy về 60 fps: **−11,11 ms/s**. Gate buộc **cả delta thô và delta chuẩn hóa ≤+10 ms/s**, mọi mẫu ≥58 fps; `cadencePass: true`, `errors: []`, `ready: true`. Mỗi mẫu 10 s sau 3 s ổn định; người chơi khoảng 9,26 m, motion bật. `test-results/ms-c2/shared-world/abba.json` và bốn PNG là bằng chứng cuối. Đây là CDP JS CPU trên source world đã warm, không phải phép đo GPU/FPS nghiệm thu hay baseline Next build thứ hai.

Các kết quả không đạt được giữ nguyên, không dùng để gọi PASS: `full-world-before-optimization/` (+179,53), `full-world-baked-unbounded/` (+189,85), `full-world-source/` (cadence 50 Hz, bị guard loại), `shared-before-basic-glass/` (+13,48), `shared-before-light-batching/` (+17,80). Diagnostic tại `diagnostic/samples.json` cho thấy A≈73 fps/B≈96 fps khi không khóa cadence; tổng draw tượng khoảng 0,078 ms/frame. Bộ giữ nhịp chỉ nằm trong reviewer, không giới hạn FPS sản phẩm. Bản cuối giảm mesh và gộp chương trình trang trí sau các kết quả fail; không nới trần hoặc tắt hậu kỳ.

Helper tự xóa file TS đối chứng trong `tmp/` khi thoát để không lẫn vào typecheck. Không sửa config để bỏ qua file.

## Nghiệm thu

```text
pnpm.cmd lint: exit 0, 0 errors / 0 warnings (xác nhận lại sau khôi phục)
pnpm.cmd typecheck: exit 0 (xác nhận lại sau khôi phục)
pnpm.cmd exec vitest run tests/unit/world/zones/milestones --maxWorkers=1:
  Test Files 5 passed (5)
  Tests      37 passed (37)
  exit 0
VITEST_MAX_WORKERS=2 pnpm.cmd test --retry=1:
  Test Files 174 passed (174)
  Tests      1870 passed (1870)
  Duration   231.59s
  exit 0
Build WASM + webpack duy nhất: hoàn tất trước mất điện lúc 12:51, log build.log;
  Compiled successfully; prerender/export + CV + OG hoàn chỉnh.
  Giữ export đã đối chiếu SHA256 asset, không build lại sau khôi phục.
pnpm.cmd exec playwright test world --workers=2:
  Running 43 tests using 2 workers
  43 passed (6.0m)
  exit 0
pnpm.cmd check:assets: status PASS; errors: []; exit 0
pnpm.cmd check:licenses: RESULT: PASS; exit 0
node tools/assets/blender/milestones-budget.mjs: pass: true; exit 0
```

Log gate trước mất điện: `tmp/ms-c2/{lint-final,typecheck-final,test-final,unit-final}.log`; build: `tmp/ms-c2/build.log`. Log xác nhận sau khôi phục: `tmp/ms-c2/{lint-resumed,typecheck-resumed,test-resumed-retry,check-assets-resumed,check-licenses-resumed,budget-resumed,e2e-world-resumed}.log`. PowerShell có thể ghi banner stderr của shim pnpm thành `NativeCommandError`; exit được lấy từ `$LASTEXITCODE`, không suy từ định dạng banner.

Lượt full unit sau khôi phục dùng hai worker ghi tại `tmp/ms-c2/test-resumed.log`: **171/174 file, 1.867/1.870 test pass**, ba timeout ngoài phạm vi (`foliage-forest`, `direction`, `attribute-budget`) khi máy chạy nhiều Node. Lượt một worker tại `tmp/ms-c2/test-resumed-single.log` tiếp tục gặp timeout `water-lighting` và `workshop`, đã dừng bằng Ctrl+C sau khi ghi nhận lỗi để chuyển sang **hai worker + `--retry=1`**. Giữ nguyên các log lỗi; không sửa test/config/ngưỡng timeout. Mỗi lần retry vẫn phải vượt qua toàn bộ assertion trong ngưỡng cũ; kết quả lệnh cuối được ghi trong khối nghiệm thu phía trên.

E2e giữ nguyên config mặc định và không thêm retry. Cả **43 dòng test đều pass** trước khi runner chờ dọn web server. Đã xác minh PID **28152**, `node`, bắt đầu **16:27:57**, chính là `serve-out` do lượt e2e này tạo, rồi chỉ dừng tiến trình đó sau khi test xong. Runner in tổng kết **43 passed (6.0m)** và trả **exit 0**; không sửa helper/config và không dừng tiến trình của worktree khác.

## Hình và clip

Ảnh nguồn dưới đây cùng reviewer, camera 1280×960, IBL/ánh sáng, không thay source để chụp before. `ms-c-before/` bổ sung bản MS-C chính xác từ Git `00e1850`; `return1-before/` là trạng thái worktree được chuyển giao trước khi sửa lượt này.

| Góc | Trước chuyển giao | Sau cuối |
|---|---|---|
| High front | [before](../../../test-results/ms-c2/return1-before/front.png) | [after](../../../test-results/ms-c2/isolated/front.png) |
| High back | [before](../../../test-results/ms-c2/return1-before/back.png) | [after](../../../test-results/ms-c2/isolated/back.png) |
| High sockets | [before](../../../test-results/ms-c2/return1-before/sockets.png) | [after](../../../test-results/ms-c2/isolated/sockets.png) |
| Low front | [before](../../../test-results/ms-c2/return1-before/low.png) | [after](../../../test-results/ms-c2/isolated/low.png) |

Ảnh production từ bản build hoàn tất lúc **12:51 ngày 14/11**, đã ghi xong trước mất điện và kiểm tra lại sau khôi phục:

- [High front](../../../test-results/ms-c2/world/high-front.png), [High back](../../../test-results/ms-c2/world/high-back.png), [High sockets](../../../test-results/ms-c2/world/high-sockets.png), [Low front](../../../test-results/ms-c2/world/low-front.png).
- [Clip High 10 s](../../../test-results/ms-c2/world/milestones-animation-10s.webm): `ffprobe` xác nhận **10,000000 s / 3.122.242 B**.
- `test-results/ms-c2/world/review.json`: `errors: []`, tải đủ GLB + hai texture deferred, người chơi cách tượng **9,26 m** nên motion bật.
- Sau khôi phục đã đối chiếu SHA256 của cả ba asset public với `out/world/milestones/`: **khớp toàn bộ**. Code runtime sửa cuối lúc 12:29, trước build; không rebuild, không xóa `.next`/`out` vì export đã hoàn chỉnh.

## Lead nối index.ts

Không cần sửa `index.ts`; registry/update/dispose hiện có đã đủ. Hợp đồng tương đương (5 dòng):

```ts
const zone = createMilestonesScene(context);
scene.add(zone.group);
zone.update?.(dt, reducedMotion);
// Khi tháo khu:
zone.dispose();
```

## Tái tạo / giới hạn

```powershell
node tools/assets/blender/milestones-bake.mjs --source
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --factory-startup -P tools/assets/blender/milestones-sculpt.py -- D:/tqa-worktrees/W-B
node tools/assets/blender/milestones-bake.mjs
```

- `.blend` high-poly ở `tmp/ms-c2/milestones-sculpt.blend`, pose/joint JSON và GLB trung gian cũng ở `tmp/`; không ship các file đó. Chỉ ba asset public được tải deferred. Normal là bake thật; AO là pigment theo vùng, không giả nhận đã ray-bake AO.
- Đã xem ảnh cảm hứng từ `D:/the-quiet-atlas/docs/art-bible/refs/milestones-shards-duy.png` (không có trong worktree). Không lấy pixel, khuôn mặt, logo, bố cục hay chữ ngoài dữ liệu chứng chỉ. Không sửa nhân vật người chơi.
- Mức đạt gu “gần thực” cần Lead xem ảnh/clip; đây vẫn là tượng điêu khắc, không mô hình nhận dạng người thật. Low giữ kính đục/chữ, bỏ ribbon và points.
- Full e2e toàn ứng dụng/Lighthouse và nghiệm thu GPU/FPS để Lead; riêng **43 e2e world** thuộc nghiệm thu ticket này. Lượt full test giữa chừng gặp timeout ở file ngoài phạm vi khi chạy đồng thời; giữ log `tmp/ms-c2/test-contention.log`, không sửa test/timeout để hợp thức hóa. Chạy lại full unit với `VITEST_MAX_WORKERS=2` để tránh tranh CPU/RAM, không đổi config hoặc ngưỡng test.
