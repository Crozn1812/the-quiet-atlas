# GFX-02 — bàn giao vòng sửa 1

Ngày 2026-11-13. Tiếp tục phần có sẵn; sửa bằng Blender MCP **9880**. Không tải ngoài, thêm dependency, reset Blender hoặc commit.

## Kết quả

- Thông a/b/c: tán nón nhiều tầng chồng kín hơn, xanh thẫm có sắc lục; thân nâu ấm. Dùng nguyên nhánh kim lá của atlas Poly Haven `pine_tree_01` trên thẻ lớn, không lấy mẩu vụn. Crop trước khi thu nhỏ và loại vùng alpha của UV island lân cận. 14 tầng, các thẻ nghiêng chồng nhau; alpha MASK hai mặt.
- Lá rộng 1/2/3 và bush: khối tán bên trong + nhiều lá chồng ở mép; xanh lục ấm quanh palette forestDeep/forestLight, COLOR_0 giảm sáng xuống dưới tán. Thân nâu xám.
- Cỏ: 20 lá, cao 0,3–0,6 m, hai đoạn tạo độ cong nhẹ; gradient vertex color sẫm ở gốc. LOD0 60 tam giác.
- Giữ nguyên GLB đã duyệt của đá 1–4, dương xỉ và gỗ đổ; packager bỏ qua việc xuất đè các file này. Giữ LICENSES.csv như phần kế thừa: chỉ 29 dòng thêm so với HEAD, vòng này không sửa dòng nào.
- Giữ schema manifest và pipeline hai file; cập nhật số đo từ GLB thực tế. Sheet cùng camera/góc/ánh sáng cũ. Ảnh nhóm có đủ 3 thông + 3 lá rộng + đá + dương xỉ, nền giấy, bóng đổ bình minh xiên.

## File bàn giao

- `public/world/lib/`: 28 GLB + manifest.json; vòng này thay 16 GLB thực vật và cập nhật manifest.
- `assets/lib/library.blend`: 14 đối tượng LOD0, packed texture, 1.524.358 byte.
- `assets/lib/SOURCES.md`: quyền và cách chạy lại offline, nêu rõ đầu vào giữ nguyên của vòng sửa.
- `assets/LICENSES.csv`: 29 dòng thêm của ticket gốc; không thay đổi thêm trong vòng sửa.
- `tools/assets/blender/lib-build.py`: geometry, vật liệu, LOD, export; giữ scene riêng và khôi phục scene trước đó kể cả khi lỗi.
- `tools/assets/blender/lib-package.mjs`: optimize, đo, manifest và chụp GLB cuối trong Edge. File sát bên ngoài glob `lib-*.py`, đã có từ phần kế thừa; tiếp tục sửa để ảnh và số liệu tái tạo được, không chạm pipeline chung.
- `docs/showcase/37-aaa/lib-sheet.webp`: 1600×1680; `lib-forest.webp`: 1600×900 (ảnh nhóm mới theo yêu cầu Lead).
- `tools/review/GFX-02-handoff.md`: bàn giao này.

Không sửa src, index.ts, package/lock/config, docs khác, styleframes hoặc tests. Các đường dẫn showcase/handoff theo yêu cầu bàn giao của ticket, dù nằm ngoài glob asset.

## Số đo sau meshopt + KTX2

| Asset | Tri LOD0 / LOD1 | Byte LOD0 / LOD1 |
|---|---:|---:|
| tree-pine-a | 1096 / 487 | 27388 / 21272 |
| tree-pine-b | 1096 / 487 | 27176 / 21232 |
| tree-pine-c | 1096 / 487 | 27544 / 21244 |
| tree-broadleaf-1 | 1104 / 531 | 32876 / 20624 |
| tree-broadleaf-2 | 1104 / 531 | 32508 / 20528 |
| tree-broadleaf-3 | 1104 / 531 | 32624 / 20500 |
| rock-boulder-1 | 372 / 142 | 18452 / 9904 |
| rock-boulder-2 | 372 / 142 | 18432 / 9908 |
| rock-boulder-3 | 372 / 142 | 18324 / 9892 |
| rock-boulder-4 | 372 / 142 | 18412 / 9912 |
| prop-fern | 281 / 132 | 11896 / 10536 |
| prop-bush | 276 / 139 | 12860 / 10136 |
| prop-grass | 60 / 28 | 4080 / 3180 |
| prop-fallen-log | 112 / 92 | 8856 / 8876 |

Tổng 28 GLB: **489.172 byte**; cả public/world/lib gồm manifest: **500.611 byte**. Max LOD0 **1.104 tri**, max LOD1 **531 tri**. Đạt cả trần ticket 8.000/2.000 và check:assets hiện hành. Tối đa **2 material/GLB** sau optimizer (COLOR_0 cho phép gộp các màu lá). Cột material trong LICENSES.csv giữ số cũ, bảo thủ, theo yêu cầu không sửa dòng; số đo chính xác nằm ở manifest. Texture KTX2 embedded có mipmap, pine/fern/log 128×128, đá 64×64; không ảnh >1K. Meshopt required trên đủ 28 file.

## Lệnh và output

Dùng pnpm.cmd tương đương pnpm vì PowerShell policy chặn launcher .ps1. Không đổi policy.

```text
pnpm.cmd lint                  exit 0 — eslint ., 0 errors / 0 warnings
pnpm.cmd typecheck             exit 0 — tsc --noEmit
pnpm.cmd test                  exit 0
 Test Files  152 passed (152)
      Tests  1774 passed (1774)
   Duration  60.68s
pnpm.cmd check:licenses        exit 0
 check-licenses (§7.3) — public files: 68 (excluding .gitkeep)
 RESULT: PASS
pnpm.cmd check:assets          exit 0
 status: PASS; worldBytes: 1211094; startBytes: 147096; errors: []
node tools/assets/blender/lib-package.mjs   exit 0
 Total GLB bytes: 489172; Public files: 29
 Edge lib-sheet {"models":14,"lodsDecoded":28,"textures":10}
 Edge lib-forest {"instances":13,"triangles":16606,"drawCallsIncludingShadows":57}
node tmp/validate-revision.mjs  exit 0
 {"assets":14,"lods":28,"texturePayloads":18,"maxMaterials":2,"publicBytes":500611,"status":"PASS"}
git diff --check               exit 0
```

Đã xem lại cả hai ảnh cuối. Node validation đọc đủ 28 GLB: một scene/node mỗi file, meshopt required, KTX2/mip ≤1K, attribute hữu hạn, COLOR_0 của lá, pine alpha MASK hai mặt. Edge không pageerror. Log vòng này ở tmp/*revision.log và tmp/test-retry-revision.log, file tạm không đưa vào git.

Lượt test đầu: 3 timeout ở contract, secrets-wiring và first-light khi máy đang xử lý asset; 149 files/1771 tests pass. Chạy lại toàn bộ nguyên lệnh đã pass như trên, không đổi timeout/test.

Build phần kế thừa đã chạy **một lần**, exit 0 (tmp/build.log), với NEXT_TEST_WASM_DIR và NEXT_BUILD_WEBPACK=1 theo hướng dẫn, compiled successfully in 44s. Vòng sửa asset này không chạy build lần hai; ảnh đọc trực tiếp GLB nén mới trong public qua viewer riêng, không dùng asset cũ trong out. Không chạy full e2e/Lighthouse.

## Giới hạn và cách nối

Thư viện vẫn là spike phong cách, lá rộng còn chất hình học/faceted. Texture 128px ưu tiên ngân sách; chưa dùng normal/roughness map scan. Alpha có thể alias ở xa; Decimate LOD1 có thể mất phiến lá/card, cần Lead duyệt khoảng chuyển LOD trong cảnh thật. Chưa đo FPS/GPU Iris Xe, tải world, luma 8 khu hay chi phí foliage khi instance hàng loạt. Số 57 draw call của ảnh nhóm gồm bóng đổ, không phải ngân sách module runtime.

Ảnh nhóm chủ động phóng dương xỉ thành cao 1,1 m để nhìn rõ; không sửa geometry dương xỉ đã duyệt. Sheet chuẩn hóa mỗi ô, không thể hiện tỷ lệ tương đối. Bốn đá vẫn là bốn biến thể của một scan. Không collider.

Chưa nối world. Lead đặt đoạn dưới trong nhánh tải deferred của index.ts sau khi renderer/scene đã có; chỉ tải một LOD cho mỗi mẫu, cache geometry/material và instance đối tượng lặp. Ví dụ 11 dòng:

```ts
const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
  import('three/examples/jsm/loaders/GLTFLoader.js'),
  import('three/examples/jsm/loaders/KTX2Loader.js'),
  import('three/examples/jsm/libs/meshopt_decoder.module.js'),
]);
const ktx = new KTX2Loader().detectSupport(renderer);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx);
const model = await loader.loadAsync('/world/lib/tree-pine-a-lod1.glb');
scene.add(model.scene);
ktx.dispose(); // sau khi tải xong batch; dispose mesh/material/texture khi teardown
```

Decoder local theo loader hiện có của dự án. Chọn khoảng LOD/batching và benchmark trước khi đưa vào Low hoặc khung đầu. Không coi unit test là bằng chứng đạt các gate hiệu năng đó.
