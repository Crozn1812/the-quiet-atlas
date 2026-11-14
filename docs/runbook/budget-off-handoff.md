# BUDGET-OFF — bàn giao 14/11/2026

ADR 0019: các số đo byte/MB, tam giác, draw call, thời gian dựng/tải, FPS và CPU chuyển sang báo cáo. Giữ gate license, leaks, 0 chunk/request 3D trước Enter World, chức năng, console/page error, file hỏng và rò rỉ tài nguyên. Không dùng cách bỏ qua exit code của toàn bộ checker.

## Phạm vi và nối tích hợp

Không sửa `src/`, `public/`, `package.json`, lockfile, hạ tầng hoặc ADR; không build, không commit. Không cần nối gì vào `src/features/world/index.ts`.

Ngoài danh sách đường dẫn ban đầu: các implementation thực tế ở `tools/assets/check-budgets.mjs`, `tools/check-bundle/`, `tools/load-budget/`, `tools/frame-budget/`, cùng các nhánh chặn ngân sách của tool export/review trong `tools/assets/`. Đây đều là phần ngân sách của cùng tính năng, được sửa trực tiếp để CLI hiện tại không tiếp tục FAIL hoặc xóa GLB khi vượt trần. Phần tạo hình/asset không thay đổi. Danh sách đầy đủ ở cuối tài liệu.

`package.json` chỉ đề xuất cho Lead (không sửa trong lane):

```json
{
  "perf:lhci": "lhci autorun --config=tools/checks/lighthouserc.cjs && node tools/checks/lighthouse-report.mjs"
}
```

`check:assets`, `check:bundle`, `test:perf` không cần đổi lệnh: implementation tại đường dẫn cũ đã dùng chế độ báo cáo. Workflow PR gọi config Lighthouse mới trực tiếp, vì script package vẫn chờ Lead sửa. Không cần code nối `index.ts`.

## Kiểm kê gate

| Điểm vào | Trước | Sau |
|---|---|---|
| `package.json` `check:assets` → `tools/assets/check-budgets.mjs` | Fail trần từng loại/tổng 30 MB | Báo cáo byte/tam giác và delta lần trước; GLB/KTX2 hỏng vẫn fail |
| `check:bundle` → `tools/check-bundle/index.mjs` | Fail JS gzip >150 KiB, tổng >1 MiB | Chỉ ghi REPORT; marker/ref 3D, thiếu trang/file vẫn fail |
| `test:perf` → load-budget | Fail thời gian >10 s, initial JS/total | Báo cáo; không playable và 3D trước Enter World vẫn fail, kể cả CPU throttle |
| Load-budget CLI đọc JSON lịch sử | Giữ status FAIL của trần cũ | Nhận diện hàng byte/time để phát lại ở chế độ REPORT; lỗi chức năng vẫn fail |
| T08 frame | Fail FPS/p95/frame chậm | Chỉ chặn thiếu/invalid measurement, focus/pause/quality và console/page error |
| T09 stability | Rò rỉ tài nguyên, crash, chức năng | Giữ nguyên |
| T07 e2e overlay | `T07_LATENCY_GATE=1` bật trần 300 ms | Luôn báo cáo, vẫn xác nhận đo hữu hạn và toàn bộ hành vi overlay |
| Unit world | Trần hình học/byte/draw/CPU, tăng tối đa 25–50% | Ghi số và delta; bất biến khác giữ nguyên |
| PR workflow | Các gate byte/time/LCP/TBT chặn job | Chạy checker report; cache baseline + artifact; LCP/TBT warn, CLS vẫn error |
| REL-03 deploy workflow | Asset-budget fail trước OIDC | Vẫn đúng vị trí trước OIDC, chỉ lỗi dữ liệu/license chặn |
| `tools/checks/**` cũ | Terraform/gitleaks/release checks, không trần world | Giữ nguyên; thêm tiện ích report/KTX2/Lighthouse |
| `tools/lead/gate.sh` | Lint/typecheck/unit; không có trần riêng | Giữ nguyên script, unit áp dụng ADR 0019 |
| Blender/export/procedural texture/Milestones review | Raise/assert/xóa output vì byte/tam giác/CPU | Chỉ log số; mismatch export, decode, console và filesystem vẫn chặn |

Các giới hạn còn lại có mục đích khác: 16 vertex attributes là khả năng phần cứng WebGL; draw range/index không vượt buffer là tính toàn vẹn; LOD chi tiết ít hơn LOD gốc, instancing/merge, số primitive/skin là cấu trúc. Mốc đi bộ Journey và thời lượng cinematic là nhịp gameplay. Trần byte trong `tools/review/*shots*`/`final-showcase.mjs` dành cho file ảnh/video bàn giao, không phải asset world; không thay đổi. `MAX_COMPRESS` của gzip server chọn chính sách nén, không làm FAIL khi asset lớn. Các phép decimate/LOD trong tool Blender là tham số tạo hình, không phải điều kiện exit.

## Cách đọc và giới hạn

Xem [full-check.md](full-check.md#đọc-báo-cáo-ngân-sách--adr-0019-14112026). `delta` là lần này trừ lần trước; lần đầu/khóa mới là `null`. Các tool export offline in số và mốc cũ; báo cáo Milestones có so sánh HEAD; checker/trace/unit/Lighthouse có JSON lịch sử trong `test-results/budget-reports/`. So CPU/thời gian cần cùng máy/phương pháp. Cache miss của CI không tạo baseline giả.

Không chạy lại build, full e2e, Lighthouse hoặc export Blender. Dùng `out/` có sẵn để kiểm bundle/leaks; số đo này không chứng minh artifact tương ứng bản merge sau cùng. Lead phải chạy lại các gate trên `main` sau merge. Lane chạy ở `lane/BUDGET-OFF`, base `b90313c`; không tự thay nhánh hay commit của Lead. KTX2 checker kiểm container/header/index/range, còn transcoding trên GPU thực tế do e2e/Lead xác nhận.

## Kết quả thực chạy

Các log nằm trong `tmp/budget-off-*.log` (không đưa vào git). PowerShell chặn shim `pnpm.ps1`, nên dùng `pnpm.cmd` tương đương; lượt unit đặt `VITEST_MAX_WORKERS=4` để hạn chế tải máy, không đổi config/test timeout.

| Lệnh | Output tổng kết | Exit |
|---|---|---|
| `pnpm.cmd lint` | `$ eslint .`, không error/warning | 0 |
| `pnpm.cmd typecheck` | `$ tsc --noEmit` | 0 |
| `VITEST_MAX_WORKERS=4 pnpm.cmd test` | `Test Files 174 passed (174)`; `Tests 1857 passed (1857)`; `Duration 116.03s` | 0 |
| `pnpm.cmd check:assets` | `status: PASS`, `worldBytes: 15569274`, `startBytes: 147096`, `assets: 44`, `errors: []`; lượt đo kế tiếp `delta.worldBytes: 0` | 0 |
| `pnpm.cmd check:bundle` | `RESULT: PASS` | 0 |
| `pnpm.cmd check:licenses` | `RESULT: PASS` | 0 |
| `pnpm.cmd check:leaks` | `RESULT: PASS` (R5 chưa chạy do thiếu `TQA_DENYLIST_FILE`, warning có sẵn) | 0 |
| `node --test tools/checks/release-upload.test.mjs` | `pass 2`, `fail 0` | 0 |
| `pnpm.cmd exec playwright test tests/e2e/world-content.spec.ts --list` | `Total: 4 tests in 1 file` — chỉ discovery, không phải e2e PASS | 0 |
| Python AST bằng Python đi kèm Blender | `Python AST: 5 passed` — không export asset | 0 |
| Node syntax của 9 JS implementation đã sửa | `Changed JS syntax: 9 passed` | 0 |
| LHCI config import | `LHCI config: LCP/TBT warn; CLS error` — không chạy Lighthouse | 0 |
| `git diff --check` | Không lỗi whitespace | 0 |
| `bash tools/lead/gate.sh .` | `unit: timeouts only, rerunning once`; `GATE PASS: lint, typecheck, Tests 1857 passed (1857)`; lượt lại `174 files`, `Duration 126.16s` | 0 |

Lượt unit đầu phát hiện fixture báo cáo nằm trong chính thư mục asset và đã sửa bằng thư mục tạm riêng; lượt không giới hạn worker bị tải máy/timeout, đã dừng. Lượt có giới hạn worker ở bảng trên đã pass toàn bộ. Gate Lead cuối exit 0; lượt đầu của gate chỉ lỗi timeout và script tự thử lại thành công theo cơ chế có sẵn. Không nới assertion, timeout hay ngưỡng để lấy PASS.

## Các assertion trần đã chuyển

Cột vị trí dùng dòng hiện tại; cột trước ghi biểu thức trần cũ. Sau mỗi dòng là `reportBudget(...)`: vẫn chặn số đo không hữu hạn, ghi số đo/mốc cũ/delta; JSON sau mỗi file còn đối chiếu lần chạy trước. Các assertion hình học, LOD, instancing, radius, collision, dispose và hành vi kế bên giữ nguyên.

| File:line | Before | After |
|---|---|---|
| tests/unit/world/foliage-assets.test.ts:48 | `triangles <= index < 3 ? 1200 : 1500` | Report + finite check |
| tests/unit/world/fish.test.ts:23 | `triangles <= 120` | Report + finite check |
| tests/unit/world/fish.test.ts:24 | `triangles * fish.mesh.count <= 8000` | Report + finite check |
| tests/unit/world/first-light-r2.test.ts:80 | `dense.getAttribute("position").count / 3 < 350` | Report + finite check |
| tests/unit/world/first-light-r2.test.ts:96 | `ceiling.mesh.count * bounds.getAttribute("position").count / 3 < 20000` | Report + finite check |
| tests/unit/world/first-light-grove.test.ts:16 | `g.getAttribute('position').count/3 <= 1200` | Report + finite check |
| tests/unit/world/far-landscape.test.ts:18 | `g.index!.count / 3 <= 51_200` | Report + finite check |
| tests/unit/world/environment-c.test.ts:44 | `bytes < 4_000_000` | Report + finite check |
| tests/unit/world/detailed-props.test.ts:110 | `triangles <= name.startsWith("rock-small") ? 200 : name.startsWith("rock") ? 400 : 600` | Report + finite check |
| tests/unit/world/detailed-props.test.ts:112 | `buffer.byteLength <= name.startsWith("rock") ? 20_000 : 80_000` | Report + finite check |
| tests/unit/world/detailed-props.test.ts:150 | `triangles <= 6000` | Report + finite check |
| tests/unit/world/detailed-props.test.ts:269 | `triangles <= GROUND_TRIANGLE_LIMIT` | Report + finite check |
| tests/unit/world/coast-r1-budget.test.ts:54 | `result.triangles <= base.triangles * 1.25` | Report + finite check |
| tests/unit/world/coast-r1-budget.test.ts:55 | `result.draws <= base.draws + 3` | Report + finite check |
| tests/unit/world/bridges.test.ts:208 | `draws <= 3` | Report + finite check |
| tests/unit/world/bridges.test.ts:209 | `triangles <= 6000` | Report + finite check |
| tests/unit/world/baked-appearance.test.ts:211 | `buffer.byteLength < 600000` | Report + finite check |
| tests/unit/world/railing.test.ts:58 | `rail.budget.trianglesPerBay < 600` | Report + finite check |
| tests/unit/world/props.test.ts:27 | `triangles(geometry) <= budget` | Report + finite check |
| tests/unit/world/pine.test.ts:97 | `triangles(geometry) + triangles(trunk) <= 600` | Report + finite check |
| tests/unit/world/pine.test.ts:265 | `triangles(first) + 42 <= 600` | Report + finite check |
| tests/unit/world/pine.test.ts:287 | `after - before <= 20` | Report + finite check |
| tests/unit/world/pine.test.ts:322 | `after <= before * 1.25` | Report + finite check |
| tests/unit/world/ground.test.ts:70 | `triangleCount(low) <= 60` | Report + finite check |
| tests/unit/world/ground.test.ts:93 | `triangleCount(geometry) <= 300` | Report + finite check |
| tests/unit/world/ground.test.ts:113 | `triangleCount(geometry) <= budget` | Report + finite check |
| tests/unit/world/ground.test.ts:225 | `renderedTriangles(meshesOf(ground)) <= 40_000` | Report + finite check |
| tests/unit/world/ground.test.ts:480 | `triangles <= 212_337 * 1.25` | Report + finite check |
| tests/unit/world/grass-field.test.ts:70 | `field.mesh.count * 12 <= 60000` | Report + finite check |
| tests/unit/world/forest-r1.test.ts:37 | `mesh.geometry.getAttribute("position").count / 3 <= 1500` | Report + finite check |
| tests/unit/world/foliage.test.ts:112 | `total <= Math.floor(577 * 1.25)` | Report + finite check |
| tests/unit/world/foliage.test.ts:302 | `after <= before * 1.25` | Report + finite check |
| tests/unit/world/foliage.test.ts:338 | `after <= before * 1.25` | Report + finite check |
| tests/unit/world/foliage-trail-canopy.test.ts:120 | `shape.index!.count / 3 <= 700` | Report + finite check |
| tests/unit/world/foliage-trail-canopy.test.ts:181 | `trees.length <= 1801` | Report + finite check |
| tests/unit/world/foliage-trail-canopy.test.ts:186 | `total <= 736223 * 1.25` | Report + finite check |
| tests/unit/world/foliage-shapes.test.ts:94 | `triangles(crown) + triangles(trunk) <= kind === "pine" ? 600 : 1500` | Report + finite check |
| tests/unit/world/foliage-natural.test.ts:34 | `scatterTile(tile).length <= 180` | Report + finite check |
| tests/unit/world/foliage-natural.test.ts:113 | `wideForest.length <= 2841` | Report + finite check |
| tests/unit/world/foliage-natural.test.ts:114 | `scatterTile(tile).length <= 180` | Report + finite check |
| tests/unit/world/foliage-library.test.ts:29 | `data.byteLength <= 60000` | Report + finite check |
| tests/unit/world/foliage-library.test.ts:34 | `lod.triangles <= id.includes("pine") ? 1200 : 1500` | Report + finite check |
| tests/unit/world/foliage-forest.test.ts:177 | `trees.length <= Math.floor(1676 * 1.25)` | Report + finite check |
| tests/unit/world/foliage-forest.test.ts:178 | `trees.length <= 3551` | Report + finite check |
| tests/unit/world/foliage-forest.test.ts:185 | `(variant.trunks.geometry.index!.count + variant.crowns.geometry.index!.count) / 3 <= 600` | Report + finite check |
| tests/unit/world/foliage-forest.test.ts:188 | `draws <= 1186` | Report + finite check |
| tests/unit/world/foliage-canopy.test.ts:62 | `forest.length <= Math.floor(2841 * 1.25)` | Report + finite check |
| tests/unit/world/foliage-canopy.test.ts:73 | `draws <= 1246` | Report + finite check |
| tests/unit/world/surf.test.ts:73 | `strip.geometry.index!.count / 3 < 10_000` | Report + finite check |
| tests/unit/world/spring.test.ts:83 | `spring.cliff.geometry.getAttribute("position").count / 3 < 4000` | Report + finite check |
| tests/unit/world/spring.test.ts:87 | `meshes.length <= 4` | Report + finite check |
| tests/unit/world/spring.test.ts:88 | `triangles <= 4500` | Report + finite check |
| tests/unit/world/sky.test.ts:913 | `mesh.geometry.getAttribute("position").count < 400` | Report + finite check |
| tests/unit/world/shore.test.ts:159 | `after <= before * 1.25` | Report + finite check |
| tests/unit/world/shore.test.ts:183 | `meshes <= SHORE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/shore.test.ts:184 | `triangles <= SHORE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/secret-landmarks.test.ts:89 | `triangles <= budget` | Report + finite check |
| tests/unit/world/rocks.test.ts:48 | `triangles(geometry) <= limits[kind]` | Report + finite check |
| tests/unit/world/rocks.test.ts:166 | `average < 20` | Report + finite check |
| tests/unit/world/rocks.test.ts:183 | `triangles(mesh.geometry) <= 700` | Report + finite check |
| tests/unit/world/road.test.ts:457 | `drawCalls <= 4` | Report + finite check |
| tests/unit/world/road.test.ts:458 | `triangles <= 14000` | Report + finite check |
| tests/unit/world/river-terrain.test.ts:192 | `tiles.length < 100` | Report + finite check |
| tests/unit/world/river-terrain.test.ts:194 | `tiles.length * TILE_HEIGHT_BYTES < 1024 * 1024` | Report + finite check |
| tests/unit/world/vehicle-budget.test.ts:37 | `count <= 8000` | Report + finite check |
| tests/unit/world/vehicle-budget.test.ts:75 | `after <= before * 1.25` | Report + finite check |
| tests/unit/world/terrain-textures.test.ts:31 | `bytes < 15_000_000` | Report + finite check |
| tests/unit/world/vehicle-view.test.ts:49 | `triangles <= 8000` | Report + finite check |
| tests/unit/world/vehicle-detail.test.ts:59 | `cursor / 3 <= 8000` | Report + finite check |
| tests/unit/world/zones/workshop.test.ts:64 | `parts.length <= ZONE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/zones/workshop.test.ts:81 | `triangles <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/workshop.test.ts:82 | `triangles <= 3680 * 1.5` | Report + finite check |
| tests/unit/world/zones/workshop.test.ts:236 | `meshes(workshop).length <= ZONE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/zones/workshop.test.ts:431 | `total <= 3680 * 1.5` | Report + finite check |
| tests/unit/world/zones/workshop.test.ts:522 | `count <= 2000` | Report + finite check |
| tests/unit/world/zones/workshop.test.ts:525 | `total <= 3680 * 1.5` | Report + finite check |
| tests/unit/world/zones/workshop.test.ts:587 | `triangles <= 153796 * 1.25` | Report + finite check |
| tests/unit/world/zones/workshop-dressing.test.ts:41 | `detail <= 6000` | Report + finite check |
| tests/unit/world/zones/roots.test.ts:252 | `triangles <= 25000` | Report + finite check |
| tests/unit/world/zones/roots.test.ts:253 | `drawCalls <= 8` | Report + finite check |
| tests/unit/world/zones/roots.test.ts:257 | `rootTriangles <= 2000` | Report + finite check |
| tests/unit/world/zones/roots.test.ts:258 | `woodTriangles - rootTriangles <= 2000` | Report + finite check |
| tests/unit/world/zones/roots.test.ts:267 | `buildTimes[3] <= 200` | Report + finite check |
| tests/unit/world/zones/roots-dressing.test.ts:125 | `all.length <= 8` | Report + finite check |
| tests/unit/world/zones/roots-dressing.test.ts:126 | `upperDetail <= before * 1.25` | Report + finite check |
| tests/unit/world/zones/quiet-shore.test.ts:92 | `triangles <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/quiet-shore.test.ts:93 | `meshes(scene).length <= 8` | Report + finite check |
| tests/unit/world/zones/quiet-shore.test.ts:95 | `propVertices(scene, node.name).length / 3 <= node.name.startsWith("fence-") ? 600 : 2000` | Report + finite check |
| tests/unit/world/zones/quiet-shore.test.ts:156 | `triangles <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/quiet-shore.test.ts:157 | `triangles <= 5465 * 1.25` | Report + finite check |
| tests/unit/world/zones/quiet-shore.test.ts:159 | `drawCalls <= ZONE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/zones/quiet-shore.test.ts:193 | `triangles <= 600` | Report + finite check |
| tests/unit/world/zones/quiet-shore.test.ts:365 | `triangles <= 400` | Report + finite check |
| tests/unit/world/zones/quiet-shore-dressing.test.ts:119 | `meshes.length <= ZONE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/zones/quiet-shore-dressing.test.ts:120 | `fallbackTotal <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/quiet-shore-dressing.test.ts:121 | `high <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/quiet-shore-dressing.test.ts:122 | `high <= 5465 * 1.25` | Report + finite check |
| tests/unit/world/zones/old-trail.test.ts:86 | `triangles <= 3108 * 1.5` | Report + finite check |
| tests/unit/world/zones/old-trail.test.ts:88 | `triangles <= 2758 * 1.25` | Report + finite check |
| tests/unit/world/zones/old-trail.test.ts:89 | `triangles <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/old-trail.test.ts:91 | `drawCalls <= ZONE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/zones/old-trail.test.ts:99 | `mesh.geometry.getAttribute("position").count / 3 <= 2000` | Report + finite check |
| tests/unit/world/zones/old-trail-dressing.test.ts:26 | `2758 + triangles < 6000` | Report + finite check |
| tests/unit/world/zones/milestones.test.ts:40 | `meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0) < 6000` | Report + finite check |
| tests/unit/world/zones/milestones-statue.test.ts:26 | `readFileSync("public/world/milestones/character-milestones-walk.glb").length < 1_500_000` | Report + finite check |
| tests/unit/world/zones/milestones-statue.test.ts:38 | `geometry.getAttribute("position").count / 3 < 25_000` | Report + finite check |
| tests/unit/world/zones/milestones-statue.test.ts:66 | `statue.group.userData.triangles < 25_000` | Report + finite check |
| tests/unit/world/zones/milestones-dressing.test.ts:53 | `triangles <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/milestones-dressing.test.ts:58 | `fallbackTriangles <= 700` | Report + finite check |
| tests/unit/world/zones/milestones-dressing.test.ts:59 | `detailTriangles <= 2000` | Report + finite check |
| tests/unit/world/zones/milestones-dressing.test.ts:60 | `2639 + detailTriangles <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/last-postcard.test.ts:213 | `triangles <= 1670 * 1.5` | Report + finite check |
| tests/unit/world/zones/last-postcard.test.ts:214 | `triangles <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/last-postcard.test.ts:215 | `drawCalls <= ZONE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/zones/last-postcard.test.ts:333 | `result.value.getAttribute("position").count / 3 <= 400` | Report + finite check |
| tests/unit/world/zones/last-postcard.test.ts:349 | `Math.max(...counts) <= 2000` | Report + finite check |
| tests/unit/world/zones/last-postcard.test.ts:406 | `count <= 1670 * 1.5` | Report + finite check |
| tests/unit/world/zones/last-postcard.test.ts:525 | `after <= before * 1.25` | Report + finite check |
| tests/unit/world/zones/last-postcard-dressing.test.ts:38 | `calls <= ZONE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/zones/last-postcard-dressing.test.ts:39 | `triangles <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/last-postcard-dressing.test.ts:48 | `base + detailed <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/horizon.test.ts:101 | `triangles <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/horizon.test.ts:105 | `drawCalls <= ZONE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/zones/horizon.test.ts:135 | `triangles <= 852 * 1.5` | Report + finite check |
| tests/unit/world/zones/horizon.test.ts:265 | `after <= before * 1.25` | Report + finite check |
| tests/unit/world/zones/horizon-dressing.test.ts:40 | `detail < 6000 - 1262` | Report + finite check |
| tests/unit/world/zones/first-light.test.ts:91 | `count <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/first-light.test.ts:93 | `count <= 6000` | Report + finite check |
| tests/unit/world/zones/first-light.test.ts:94 | `count <= 5176 * 1.25` | Report + finite check |
| tests/unit/world/zones/first-light.test.ts:96 | `count <= 5176 * 1.5` | Report + finite check |
| tests/unit/world/zones/first-light.test.ts:97 | `objects.length <= ZONE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/zones/first-light.test.ts:205 | `meshes(scene).reduce((sum, mesh) => sum + triangles(mesh.geometry), 0) <= ZONE_BUDGET.triangles` | Report + finite check |
| tests/unit/world/zones/first-light.test.ts:206 | `meshes(scene).length <= ZONE_BUDGET.drawCalls` | Report + finite check |
| tests/unit/world/zones/first-light.test.ts:307 | `triangles(mesh.geometry) <= 200` | Report + finite check |
| tests/unit/world/zones/first-light.test.ts:399 | `count <= 2000` | Report + finite check |
| tests/unit/world/zones/first-light.test.ts:584 | `times[2] <= 200` | Report + finite check |
| tests/unit/world/zones/first-light-dressing.test.ts:81 | `triangles(batch.mesh) < 300` | Report + finite check |
| tests/unit/world/wood.test.ts:61 | `triangles(geometry) <= budget` | Report + finite check |
| tests/unit/world/waymarks.test.ts:72 | `triangles <= 3000` | Report + finite check |
| tests/unit/world/water.test.ts:355 | `sea.mesh.geometry.index!.count / 3 <= 2 * 1.1` | Report + finite check |
| tests/unit/world/foliage-natural.test.ts:187 | `Object.values(foliage.species).flatMap(species => species.variants) .flatMap(variant => [variant.trunks, variant.crowns]).filter(mesh => mesh.count > 0).length <= 4` | Report + finite check |

## Other changed gate locations

| File:line | Before | After |
|---|---|---|
| tools/assets/check-budgets.mjs:54 | Per-type triangle/byte limit -> errors | Per-type measurements + legacy reference |
| tools/assets/check-budgets.mjs:61 | World/start byte limit -> errors | World/start measured only |
| tools/assets/check-budgets.mjs:71 | No previous measurement | Persist metrics and delta |
| tools/check-bundle/index.mjs:166 | JS gzip limit -> errors | REPORT warning only |
| tools/check-bundle/index.mjs:169 | Total transfer limit -> errors | REPORT warning only |
| tools/load-budget/index.mjs:125 | Initial total/JS limits -> FAIL | Report rows; zero 3D still a gate |
| tools/load-budget/index.mjs:146 | World bytes/time limits -> FAIL | Report rows; never playable still FAIL |
| tools/load-budget/index.mjs:159 | Historical JSON retains cap FAIL | Replay byte/time as REPORT |
| tools/frame-budget/index.mjs:71 | Numeric thresholds -> FAIL | withinReference metadata; only missing/nonfinite measure FAIL |
| tests/e2e/world-content.spec.ts:62 | Opt-in 300 ms assertion | Always record finite latency |
| tests/perf/load-budget.perf.ts:300 | No previous trace delta | Persist per-locale/CPU measurements |
| tests/perf/load-budget.perf.ts:311 | Throttle mode returned before functional assertion | Throttle annotation only; functional assertion still runs |
| tests/perf/t08-frame-budget.frame.ts:58 | Frame budget fails over reference | Persist scenario/run statistics |
| tools/assets/blender/character.py:315 | Raise over MAX_TRIANGLES | Report only |
| tools/assets/blender/character.py:333 | Delete GLB + raise over MAX_BYTES | Keep GLB and report |
| tools/assets/blender/gd110.py:246 | Raise over triangle ceiling | Report only |
| tools/assets/blender/gd110.py:254 | Delete GLB + raise over byte ceiling | Keep GLB and report |
| tools/assets/blender/character_c.py:148 | Raise over 12000 triangles | Report only |
| tools/assets/blender/character_rig.py:345 | Mismatch OR triangle ceiling fails | Only export mismatch fails |
| tools/assets/blender/props.py:22 | Assert face limit | Report faces/reference |
| tools/assets/blender/props.mjs:37 | Throw over triangle/byte ceiling | Report measurements/reference |
| tools/assets/blender/lib-package.mjs:50 | Throw over LOD triangle ceiling | Report measurements/reference |
| tools/assets/textures/generate.mjs:80 | Throw over 600000 bytes | Report bytes/reference |
| tools/assets/blender/milestones-budget.mjs:43 | Assert triangle/draw/byte cap | Report current vs HEAD delta |
| tools/assets/blender/milestones-world-review.mjs:102 | Assert CPU delta <=10 ms/s | Report CPU delta |
| .github/workflows/pr.yml:49 | No baseline | Restore/save per-ref baseline cache |
| .github/workflows/pr.yml:130 | LHCI default LCP/TBT numeric gates | Report config; keep CLS gate |
| .github/workflows/deploy.yml:73 | Asset budget gate before OIDC | Asset report/integrity gate before OIDC |
| tests/unit/tools/assets.test.ts:102 | Expect over-budget exit 1 | Expect measured over-budget exit 0 |
| tests/unit/tools/check-bundle.test.ts:118 | Expect cap errors | Expect report warnings and no cap errors |
| tests/unit/tools/load-budget.test.ts:89 | Expect byte/time FAIL | Expect report PASS; functional FAIL preserved |
| tests/unit/tools/frame-budget.test.ts:67 | Expect slow frame FAIL | Expect valid measurement PASS |
| tests/unit/tools/gd110-script.test.ts:37 | Assert cap values/branches in source | Assert export measurement/output contract |
| tests/unit/tools/blender-scripts.test.ts:62 | Assert MAX byte/triangle constants | Assert measurements printed |
| tests/unit/tools/character-rig.test.ts:11 | Require budget constant in import | Require shared builder |

## Changed files

- `.github/workflows/deploy.yml`
- `.github/workflows/pr.yml`
- `docs/runbook/budget-off-handoff.md`
- `docs/runbook/full-check.md`
- `tests/e2e/world-content.spec.ts`
- `tests/perf/load-budget.perf.ts`
- `tests/perf/t08-frame-budget.frame.ts`
- `tests/unit/tools/assets.test.ts`
- `tests/unit/tools/blender-scripts.test.ts`
- `tests/unit/tools/budget-report.test.ts`
- `tests/unit/tools/character-rig.test.ts`
- `tests/unit/tools/check-bundle.test.ts`
- `tests/unit/tools/frame-budget.test.ts`
- `tests/unit/tools/gd110-script.test.ts`
- `tests/unit/tools/load-budget.test.ts`
- `tests/unit/world/baked-appearance.test.ts`
- `tests/unit/world/bridges.test.ts`
- `tests/unit/world/coast-r1-budget.test.ts`
- `tests/unit/world/detailed-props.test.ts`
- `tests/unit/world/environment-c.test.ts`
- `tests/unit/world/far-landscape.test.ts`
- `tests/unit/world/first-light-grove.test.ts`
- `tests/unit/world/first-light-r2.test.ts`
- `tests/unit/world/fish.test.ts`
- `tests/unit/world/foliage-assets.test.ts`
- `tests/unit/world/foliage-canopy.test.ts`
- `tests/unit/world/foliage-forest.test.ts`
- `tests/unit/world/foliage-library.test.ts`
- `tests/unit/world/foliage-natural.test.ts`
- `tests/unit/world/foliage-shapes.test.ts`
- `tests/unit/world/foliage-trail-canopy.test.ts`
- `tests/unit/world/foliage.test.ts`
- `tests/unit/world/forest-r1.test.ts`
- `tests/unit/world/grass-field.test.ts`
- `tests/unit/world/ground.test.ts`
- `tests/unit/world/pine.test.ts`
- `tests/unit/world/props.test.ts`
- `tests/unit/world/railing.test.ts`
- `tests/unit/world/report-budget.ts`
- `tests/unit/world/river-terrain.test.ts`
- `tests/unit/world/road.test.ts`
- `tests/unit/world/rocks.test.ts`
- `tests/unit/world/secret-landmarks.test.ts`
- `tests/unit/world/shore.test.ts`
- `tests/unit/world/sky.test.ts`
- `tests/unit/world/spring.test.ts`
- `tests/unit/world/surf.test.ts`
- `tests/unit/world/terrain-textures.test.ts`
- `tests/unit/world/vehicle-budget.test.ts`
- `tests/unit/world/vehicle-detail.test.ts`
- `tests/unit/world/vehicle-view.test.ts`
- `tests/unit/world/water.test.ts`
- `tests/unit/world/waymarks.test.ts`
- `tests/unit/world/wood.test.ts`
- `tests/unit/world/zones/first-light-dressing.test.ts`
- `tests/unit/world/zones/first-light.test.ts`
- `tests/unit/world/zones/horizon-dressing.test.ts`
- `tests/unit/world/zones/horizon.test.ts`
- `tests/unit/world/zones/last-postcard-dressing.test.ts`
- `tests/unit/world/zones/last-postcard.test.ts`
- `tests/unit/world/zones/milestones-dressing.test.ts`
- `tests/unit/world/zones/milestones-statue.test.ts`
- `tests/unit/world/zones/milestones.test.ts`
- `tests/unit/world/zones/old-trail-dressing.test.ts`
- `tests/unit/world/zones/old-trail.test.ts`
- `tests/unit/world/zones/quiet-shore-dressing.test.ts`
- `tests/unit/world/zones/quiet-shore.test.ts`
- `tests/unit/world/zones/roots-dressing.test.ts`
- `tests/unit/world/zones/roots.test.ts`
- `tests/unit/world/zones/workshop-dressing.test.ts`
- `tests/unit/world/zones/workshop.test.ts`
- `tools/assets/blender/character.py`
- `tools/assets/blender/character_c.py`
- `tools/assets/blender/character_rig.py`
- `tools/assets/blender/gd110.py`
- `tools/assets/blender/lib-package.mjs`
- `tools/assets/blender/milestones-budget.mjs`
- `tools/assets/blender/milestones-world-review.mjs`
- `tools/assets/blender/props.mjs`
- `tools/assets/blender/props.py`
- `tools/assets/check-budgets.mjs`
- `tools/assets/textures/generate.mjs`
- `tools/check-bundle/index.mjs`
- `tools/checks/budget-report.d.mts`
- `tools/checks/budget-report.mjs`
- `tools/checks/ktx2.mjs`
- `tools/checks/lighthouse-report.mjs`
- `tools/checks/lighthouserc.cjs`
- `tools/frame-budget/index.d.mts`
- `tools/frame-budget/index.mjs`
- `tools/load-budget/index.d.mts`
- `tools/load-budget/index.mjs`

## Paths outside the original allow-list

Only budget failure/report branches changed in these actual checker/export implementations; no asset/model generation parameters changed.

- `tools/assets/blender/character.py`
- `tools/assets/blender/character_c.py`
- `tools/assets/blender/character_rig.py`
- `tools/assets/blender/gd110.py`
- `tools/assets/blender/lib-package.mjs`
- `tools/assets/blender/milestones-budget.mjs`
- `tools/assets/blender/milestones-world-review.mjs`
- `tools/assets/blender/props.mjs`
- `tools/assets/blender/props.py`
- `tools/assets/check-budgets.mjs`
- `tools/assets/textures/generate.mjs`
- `tools/check-bundle/index.mjs`
- `tools/frame-budget/index.d.mts`
- `tools/frame-budget/index.mjs`
- `tools/load-budget/index.d.mts`
- `tools/load-budget/index.mjs`
