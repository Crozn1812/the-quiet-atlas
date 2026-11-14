# HR-TREE1b — tre / trúc

Ba study tre được dựng bằng Blender CLI, đơn vị mét, seed cố định: khóm đứng 19 thân, khóm vồng 17 thân, ven suối 13 thân. Thân cong từ gốc ra ngọn, vòng đốt hình học khoảng 0,42 m; cành nhỏ mọc ở đốt; lá mũi mác gấp nhẹ, rủ xuống, tán nhìn xuyên được. Có măng, bẹ và lá rụng. Đây là geometry tự tạo CC0, không phải scan hay định danh một loài tre Việt Nam.

## File giao

- `hr-trees-bamboo.py`: authoring riêng tre; dùng chung Curve to Mesh geometry nodes từ `hr-trees.py`.
- `hr-trees.py`: full-library authoring chuyển riêng phần tre sang generator mới, giữ đường tái tạo của cây khác.
- `hr-trees-package.mjs --bamboo`: chỉ ghi ba mục tre và sáu GLB LOD; giữ thứ tự/mọi dữ liệu manifest ngoài tre. Bỏ bước phóng sprig của cây gỗ đối với tre. Hai texture 2048² KTX2 UASTC nhúng trong mỗi GLB, geometry meshopt; không thêm/sửa texture chung của các cây khác.
- `hr-trees-review.mjs --bamboo`, `hr-trees-viewer.mjs`: ảnh ba biến thể, bake impostor bốn hướng, so sánh tre cũ/mới và ABBA trong asset viewer.
- `hr-trees-bamboo-world-review.mjs after|before|low`: dùng `captureIngame` / First Light và cùng static export; camera opt-in QA. Bản before chỉ phát lại GLB tre và manifest cũ qua Playwright route, không thay runtime, không thêm cây vào scene.
- `public/world/lib/hr-tree-bamboo-{clump,arching,riverside}-{lod0,lod1,impostor}.glb`: chín GLB; giữ nguyên sáu tên cũ, thêm ba tên riverside.
- `public/world/lib/manifest.json`: thay hai mục tre, thêm riverside, bounds/hash/byte/LOD/impostor và metadata gió.
- `assets/LICENSES.csv`: cập nhật sáu dòng tre cũ, thêm ba dòng riverside; mỗi GLB đúng một dòng.
- `tests/unit/world/hr-tree-manifest.test.ts`: kiểm tra 13 asset HR, hash/byte/giải mã/texture/alpha/license/impostor, thuộc tính gió và vùng thân thấp còn lộ.
- `hr-trees-bamboo-review/`: ảnh, manifest inventory, bảng tam giác/byte, số liệu và kết quả kiểm tra.

Không sửa `src/**`, dependency, config, docs, e2e/perf test; không download, không persistence, không commit. `tmp/`, `out/`, `test-results/` là output chạy tool, không phải mã giao. Không có file nguồn ngoài phạm vi ticket.

## Ảnh

- High từng biến thể: [đứng](hr-trees-bamboo-review/hr-tree-bamboo-clump-high.png), [vồng](hr-trees-bamboo-review/hr-tree-bamboo-arching-high.png), [ven suối](hr-trees-bamboo-review/hr-tree-bamboo-riverside-high.png).
- Asset viewer: [tre cũ](hr-trees-bamboo-review/before-high.png), [tre mới](hr-trees-bamboo-review/after-high.png), [impostor](hr-trees-bamboo-review/low-impostor.png).
- Game First Light: [High trước](hr-trees-bamboo-review/world-before-high.png), [High sau](hr-trees-bamboo-review/world-after-high.png), [Low](hr-trees-bamboo-review/world-low-low.png). Xem camera và cây chọn trong `world-pose.json`; kết quả/giới hạn thực tế của capture nằm trong các `world-*-metrics.json`.

Góc game chọn khóm clump có sẵn ở `(42,21; 7,56; -22,94)`, cách tim suối **23,55 m**, trong rừng First Light gần bờ; không phải placement ngay mép nước. Tán cây gỗ hiện có che một phần ngọn tre. Không dời/xóa cây khác để tạo ảnh. Runtime đã request clump LOD0 ở góc này; trước/sau phát lại cùng camera. Biến thể riverside mới có ảnh High riêng, **chưa được runtime chọn trong ảnh game**, vì pool HR-TREE2 còn cố định. Đây là phần Lead cần nối tiếp để có khóm mới ngay mép nước.

## Nguồn và giới hạn

Không tải nguồn mới. Dùng cache Poly Haven đã có trên máy, copy vào `tmp/gfx-p2/` và kiểm SHA-256 theo `tools/assets/textures/cc0-sources.json` trước authoring. Nguồn: [pine_bark](https://polyhaven.com/a/pine_bark), [forest_floor](https://polyhaven.com/a/forest_floor), [CC0](https://polyhaven.com/license). Hình học, outline/gân lá, bố trí và bake tự tạo, dedicated CC0-1.0.

Texture thân là grain từ ảnh bark đã làm mượt, kéo dọc và đổi sắc; texture lá là outline/gân mũi mác tự vẽ với biến thiên màu từ ảnh forest floor. **Không phải texture chụp trực tiếp tre sống**, không dùng ảnh AI. Texture atlas 2K không đồng nghĩa chi tiết ảnh gốc của một lá là 2K. Thân dùng bề mặt màu/roughness và đốt hình học, chưa có bộ scan PBR tre riêng. Chưa xác nhận tiêu chí khó phân biệt ảnh thật của HR-common; cần Art review, nhất là close-up.

`_HR_WIND` ở POINT, có trong cả hai LOD: thân ≤ 0,12; cành ≤ 0,36; lá = 1; lá/bẹ rụng = 0. COLOR_0 giữ sắc/tuổi thân và phần khô. Runtime HR hiện tại nhận biết alpha cutout, thêm flutter riêng cho lá so với thân; chưa đọc trọng số `_HR_WIND` để khóa từng vertex. File giữ sẵn trọng số cho Lead dùng trong shader gió sau này.

## Tam giác / draw / byte / CPU

[Bảng đủ ba LOD](hr-trees-bamboo-review/table.md), [ABBA asset viewer](hr-trees-bamboo-review/metrics.json). Draw asset: LOD0/LOD1 = 4; impostor = 1. Tam giác LOD0/LOD1/impostor:

| Biến thể | Tam giác | Byte GLB |
|---|---:|---:|
| Đứng | 212.593 / 112.517 / 2 | 7.639.444 / 6.560.768 / 733.836 |
| Vồng | 193.013 / 102.162 / 2 | 7.451.736 / 6.464.680 / 431.720 |
| Ven suối | 124.045 / 65.721 / 2 | 6.738.920 / 6.100.124 / 551.548 |

Tổng tre trước 10.510.532 B → sau 42.672.776 B, **+32.162.244 B** GLB. Không thêm shared texture. Hai khóm thay thế chiếm 29.282.184 B; biến thể ven suối thêm 13.390.592 B. Manifest thay đổi được tính riêng trong validation. Texture nhúng lặp ở hai LOD để file tre tự chứa và không chạm kho texture chung; đây là đánh đổi byte/loading, vẫn deferred sau play, không preload LOD0 trên Low.

Manifest tăng 1.892 B; tổng delta public **+32.164.136 B**.

Asset viewer ABBA: A = tre clump cũ, B = tre clump mới; Edge SwiftShader, cùng thiết lập đèn/shadow/ground, camera tự fit bounds từng khóm. FPS A1/B1/B2/A2 = 2,58 / 5,38 / 5,80 / 2,69; renderer TaskDuration ms/s = 344,42 / 93,35 / 111,30 / 352,53. Số này chỉ mô tả phiên capture trên máy chia sẻ, không phải benchmark Iris Xe hay tổng CPU GPU process, cũng không phải ABBA camera cố định trong game. Draw/tri render trong metrics có ground/shadow; không nhầm với số asset trong bảng.

Game trên Edge headful / **RTX 3060**, không phải Iris Xe/SwiftShader. Đếm draw/tri bằng các lệnh WebGL của cả frame, bao gồm shadow/post. Số đo rAF dưới đây chỉ là phiên QA, không phải benchmark ABBA trong game:

| Phiên | Click → playable | Draw/frame | Tri/frame | FPS ghi nhận | Renderer TaskDuration ms/s |
|---|---:|---:|---:|---:|---:|
| High trước | 9.340,7 ms | 189 | 4.069.547 | 100 | 514,84 |
| High sau | 12.745,9 ms | 192 | 3.851.609 | 100 | 609,28 |
| Low | 10.627,9 ms | 38 | 254.494 | 100 | 250,30 |

High sau trùng một phần thời gian gate unit chạy trên máy chia sẻ; không suy luận hồi quy loading/CPU từ hai phiên. Low được chọn qua menu sau Enter World nên log có thể chứa request HR từ chất lượng mặc định trước đó; không phải preload HR khi đã chọn Low. Không có page error trong ba phiên. Gió bị tắt bằng prefers-reduced-motion để so ảnh cùng góc; thuộc tính gió được kiểm tra trong unit test, shader flutter là đường runtime HR hiện có.

## Lead nối vào runtime / index.ts

Hai ID cũ đã được HR-TREE2 dùng qua đường dẫn cũ, không cần sửa entry để thay asset. Loader giữ nguyên primitive PBR, meshopt/KTX2, alpha MASK hai mặt và quản lý dispose hiện có. Không dùng `flattenLibraryTree`.

Manifest có riverside nhưng `HR_TREE_IDS` / `preferences` ở `foliage/hr-variation.ts` vẫn là danh sách 12 ID cố định, **không tự chọn riverside chỉ nhờ thêm manifest**. Lead cần thêm ID vào type/pool ven suối trong HR-TREE2; không sửa các file đó trong ticket asset này. Nếu cần kiểm tra một placement từ callback sau playable ở `index.ts` (loader, scene, bankPosition do runtime cấp):

```ts
if (playable && quality !== "Low") {
  const lib = await fetch("/world/lib/manifest.json").then(r => r.json());
  const meta = lib.assets.find(a => a.id === "hr-tree-bamboo-riverside");
  const gltf = await loader.loadAsync(meta.lods[0].path);
  gltf.scene.position.copy(bankPosition);
  scene.add(gltf.scene);
}
```

Production dùng lease/instancing của HR-TREE2 thay vì nạp nhiều scene trùng nhau. Chỉ gọi sau playable, một lần/tile; teardown dispose theo quyền sở hữu. Không import world từ app/components.

## Tái tạo và kiểm tra

Trước khi thay asset, lưu sáu GLB tre cũ và manifest vào `tmp/hr-trees-bamboo-before/` để phát lại before; ảnh giao đã được giữ trong evidence. Cache ảnh phải có đủ các map pine_bark/forest_floor đúng SHA.

```text
blender.exe --background --threads 4 --python tools/assets/blender/hr-trees-bamboo.py
node tools/assets/blender/hr-trees-package.mjs --bamboo
node tools/assets/blender/hr-trees-review.mjs --bamboo
pnpm lint
pnpm typecheck
pnpm test
# Build một lần với NEXT_TEST_WASM_DIR + NEXT_BUILD_WEBPACK=1 theo ticket.
node tools/assets/blender/hr-trees-bamboo-world-review.mjs after
node tools/assets/blender/hr-trees-bamboo-world-review.mjs before
node tools/assets/blender/hr-trees-bamboo-world-review.mjs low
pnpm exec playwright test world --workers=2
pnpm check:assets
pnpm check:licenses
```

Log đầy đủ ở `tmp/hr-trees-bamboo-*.log`; các dòng tổng kết và exit code được ghi trong [validation](hr-trees-bamboo-review/validation.json). `check:assets` toàn kho hiện có hai lỗi tên `roots/roots-tree-lod0.glb`, `roots/roots-tree-lod1.glb`, ngoài ticket và không sửa; scoped `public/world/lib` PASS. Không báo toàn kho PASS khi hai lỗi này còn tồn tại.

Kết quả cuối:

```text
pnpm lint: exit 0, 0 warnings
pnpm typecheck: exit 0
pnpm test: Test Files 189 passed (189); Tests 1964 passed | 1 skipped (1965); exit 0
tools/lead/gate.sh: GATE PASS: lint, typecheck, Tests 1964 passed | 1 skipped (1965); exit 0
pnpm build (WASM + webpack): exit 0; đúng 1 lần
pnpm exec playwright test world --workers=2: 43 passed (7.1m); exit 0
pnpm check:licenses: public files 154; RESULT: PASS; exit 0
pnpm check:assets: FAIL, 2 lỗi tên file roots có sẵn; exit 1
node tools/assets/check-budgets.mjs public/world/lib: PASS; exit 0
git diff --check: exit 0
```

Gate dùng quy tắc sẵn có: lần unit đầu timeout, tự chạy lại một lần và pass toàn bộ. Không sửa timeout/config/test khác. Một lượt lint chạy trùng lúc Playwright tạo JS trace tạm bị lint vào trace; sau cleanup, chạy lại nguyên `pnpm lint` exit 0, không warning.

E2e dùng `E2E_PORT=4398`, 2 workers, Edge mặc định, đúng 43 test của 11 spec world trên cùng export. Sau mọi test pass, Playwright kẹt cleanup server Windows. Đã đối chiếu PID node 23160 đang LISTEN ở cổng riêng 4398 và thời gian bắt đầu khớp log lượt test, chỉ dừng server đó; runner kết thúc **exit 0**, in `43 passed (7.1m)`. Không đổi runtime hay copy sửa asset vào out sau build. Cả chín GLB và manifest trong out khớp SHA/byte public; dữ liệu manifest ngoài tre giữ nguyên.

Chưa chốt đầy đủ tiêu chí nhận ticket: checker toàn kho còn hai lỗi roots ngoài phạm vi; placement riverside ngay mép nước và Art/photoreal acceptance vẫn cần Lead. Các kết quả PASS trên đây không thay thế các phần đó. Không commit.
