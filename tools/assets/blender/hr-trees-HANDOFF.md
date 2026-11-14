# HR-TREE1 — bàn giao kho asset

Ảnh: [High trước](hr-trees-review/before-high.png), [High sau](hr-trees-review/after-high.png), [impostor rẻ](hr-trees-review/low-impostor.png). Đây là cùng camera của **asset viewer**, cây cũ được chuẩn hóa chiều cao để so sánh. Không phải ảnh đã tích hợp HR-TREE2. Mỗi cây còn có ảnh `hr-trees-review/hr-tree-*-high.png`.

## Phạm vi và file

- `tools/assets/blender/hr-trees.py`: authoring Blender, seed cố định, Curve to Mesh geometry nodes có Radius field, cành nhiều cấp, bạnh rễ lõm, đốt tre, dây leo quấn thân và bám cành, hình học rêu gốc. Scene Blender riêng, không sửa scene của worker khác.
- `hr-trees-package.mjs`: chuyển alpha MASK hai mặt, giữ PBR/normal, metadata diffuse transmission, nén meshopt và KTX2 UASTC, tách ba texture dùng chung. Có kiểm tra topology cụm lá trước khi mở rộng độ phủ tán; LOD1 bỏ nguyên sprig.
- `hr-trees-viewer.mjs`, `hr-trees-review.mjs`: xem **file đã nén**, bake impostor bốn góc, ảnh từng cây, đo ABBA trong Edge SwiftShader.
- `hr-trees-world-review.mjs`: dùng `tools/review/ingame-shots.mjs` để chụp cùng góc First Light High trước/sau và Low; kiểm tra không có request `hr-*` trong game chưa tích hợp.
- `hr-trees-review/`: ảnh, inventory, bảng số liệu, metrics, kết quả xác minh.
- `public/world/lib/hr-tree-*-lod0.glb`, `*-lod1.glb`, `*-impostor.glb`: 36 GLB; `hr-shared-*.ktx2`: 3 texture chung, 2K thực.
- `public/world/lib/manifest.json`: chỉ thêm 12 mục vào cuối `assets`; giữ nguyên các mục và metadata trước đó, kể cả `textureMaxDimension: 256` của kho cũ. HR đọc `textureMaxDimension: 2048` của từng mục.
- `assets/LICENSES.csv`: thêm đúng 39 dòng; `tests/unit/world/hr-tree-manifest.test.ts`: giải mã toàn bộ GLB, kiểm tra byte/hash/texture/LOD/alpha/translucency/UV và license.

Không sửa file ngoài vùng ticket; không dependency, download, persistence hay commit. Không sửa foliage, index.ts hoặc content.

## Sản phẩm và quyền

12 kiến trúc/seed khác nhau: hai cây bạnh rễ, tán xòe, tán dù, hai thân mảnh, hai bụi tre, cây nghiêng ven nước, cây đổ còn sống và hai cây chết. Đây là nghiên cứu dáng cây phù hợp bối cảnh nhiệt đới, **không phải scan hay định danh loài thực vật Việt Nam**. Bảy cây có dây leo; cây gỗ có bốn cấp cành, tre có ba cấp, ngoài thân chính.

Nguồn offline đã có trên máy, kiểm SHA-256 theo `tools/assets/textures/cc0-sources.json`:

- [Poly Haven pine_bark](https://polyhaven.com/a/pine_bark): diffuse và normal ảnh chụp, 2048².
- [Poly Haven forest_floor](https://polyhaven.com/a/forest_floor): bốn lá ảnh chụp được trace alpha, đổi sắc và ghép thành bốn sprig. Không dùng pixel tham chiếu art.
- [Poly Haven CC0](https://polyhaven.com/license). Hình học, mask trace, cách ghép atlas và bake tự tạo được dành tặng CC0-1.0 trong script và CSV.

Atlas cụm lá 2048² **không đồng nghĩa** từng lá có chi tiết gốc 2K: các đảo ảnh chụp chỉ khoảng 50–100 pixel trước khi ghép. Lá được đổi sắc từ lá rụng. Rêu là hình học tự tạo với vật liệu vỏ đổi sắc, chưa phải scan rêu. Đây là các giới hạn hình ảnh còn lại; chưa xác nhận đạt tiêu chí khó phân biệt ảnh thật khi nhìn cận cảnh. Cần Lead/Art review trong ánh sáng và bố cục rừng sau HR-TREE2.

## Tam giác, draw, byte và CPU

[Bảng từng cây](hr-trees-review/table.md) ghi LOD0 / LOD1 / impostor. Byte GLB **không cộng lặp** texture chung; dependency texture của từng LOD nằm trong manifest, có byte và SHA riêng.

- 36 GLB: **43.626.860 B**; 3 texture chung: **10.908.897 B**; tổng public thêm: **54.535.757 B**.
- LOD0: 160.804–392.068 tam giác/cây, 2–4 draw. LOD1: 34.846–136.242 tam giác/cây, 2–4 draw. Impostor: 2 tam giác, 1 draw, atlas 2048² có bốn hướng.
- [ABBA đầy đủ](hr-trees-review/metrics.json): A = cây broadleaf cũ; B = buttress-emergent mới; cùng camera, ánh sáng, PCF shadow và ground của viewer. Draw/triangle render trong metrics có cả shadow và ground; khác số asset trong bảng.
- FPS A1/B1/B2/A2 = **14,73 / 3,58 / 2,64 / 8,19**; CDP renderer TaskDuration = **9,09 / 3,17 / 3,08 / 15,04 ms/s**.
- Đây là **Edge SwiftShader trên máy đang dùng chung**. TaskDuration chỉ là CPU task của renderer, không gồm tổng CPU của GPU process/SwiftShader; không được diễn giải số nhỏ hơn thành cải thiện hiệu năng. Chưa có ABBA trong world đã tích hợp hay đo Iris Xe.
- [Ảnh game High trước](hr-trees-review/world-before-high.png), [High sau](hr-trees-review/world-after-high.png), [Low](hr-trees-review/world-low-low.png): cùng First Light, game vẫn dùng kho cũ. Không phải bằng chứng cây mới đã vào world.
- [Thời gian tới playable và request](hr-trees-review/world-metrics.json): High trước **8.062,6 ms**, High sau **8.296,8 ms**, Low **8.358,1 ms**. Đo click Enter World → DOM build=done + intro=done, QA skip intro. Không có request HR hay page error ở cả ba phiên.

## Lead nối vào index.ts / HR-TREE2

Không đưa các asset này qua `flattenLibraryTree`: loader cũ gộp vật liệu, bỏ map vỏ/normal và giới hạn 1.500 tam giác. Cần giữ primitive PBR riêng; instance theo cây/primitive, chọn một LOD theo khoảng cách, cull và giải phóng geometry/material/texture khi teardown. Low giữ fallback hiện có; có thể dùng impostor theo quyết định HR-TREE2.

Sau frame có thể điều khiển, dùng GLTFLoader đã cấu hình meshopt/KTX2 và decoder tự host. Ví dụ trong callback sau play (không copy thẳng vào entry trước Enter World):

```ts
if (playable && quality !== "Low") {
  const lib = await fetch("/world/lib/manifest.json").then(r => r.json());
  const tree = lib.assets.find(a => a.id === "hr-tree-buttress-emergent");
  const gltf = await loader.loadAsync(tree.lods[0].path);
  gltf.scene.position.copy(placement);
  scene.add(gltf.scene);
}
```

`loader`, `playable`, `quality`, `placement` là context do HR-TREE2 cấp. Thực thi một lần cho tile/asset; không gọi fetch mỗi frame hoặc tải cả 12 LOD0 cùng lúc. GLB dùng ảnh ngoài cùng thư mục: phải giữ ba `hr-shared-*.ktx2` cạnh GLB khi publish. Viewer dùng decoder trong `node_modules` qua Vite; đây không phải đường dẫn decoder production.

`KHR_materials_diffuse_transmission` lưu factor 0,32 và màu xuyên sáng trên lá. Three đang cài chưa có handler extension này. Khi tích hợp phải chuyển phần backlight trong `hr-trees-viewer.mjs` sang shader foliage hoặc cài handler tương đương; tải GLB mặc định chỉ cho alpha-cutout hai mặt. Viewer dùng xấp xỉ thin-leaf backlight, không phải phép đo sinh học.

Impostor chứa **một billboard** và bốn ảnh azimuth 0/90/180/270 trong atlas; chọn góc gần nhất, đổi UV theo `uvRects`, quay mặt về camera quanh `center`. Trục Y, đơn vị mét. `bounds` là bounds hình thật, `frame` là kích thước khung bake có đệm. Không cast shadow từ impostor vì ánh sáng đã bake. Giữ nguyên offset `center` của cây đổ; không dựng thẳng theo giả định cây có chiều cao bằng metadata authoring.

## Tái tạo và xác minh

Không tải nguồn mới. Cần các cache ảnh được SHA xác nhận ở `tmp/gfx-p2/`:

1. `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --threads 4 --python tools/assets/blender/hr-trees.py`
2. `node tools/assets/blender/hr-trees-package.mjs`
3. `node tools/assets/blender/hr-trees-review.mjs`
4. Chạy lint/typecheck/test, build một lần bằng WASM + webpack theo ticket, e2e world 2 workers, rồi `hr-trees-world-review.mjs <local-url>`.

Packager tái tạo riêng 12 ID thuộc ticket, không đổi mục kho cũ. Không chạy packager đồng thời review/bake vì bước cuối review ghi lại impostor metadata vào manifest.

Kết quả lệnh cuối cùng lưu ở `hr-trees-review/validation.json`; các log đầy đủ tại `tmp/hr-trees-*.log` (ignored).

```text
pnpm lint: exit 0, 0 warnings
pnpm typecheck: exit 0
pnpm test: Test Files 174 passed (174); Tests 1856 passed (1856); exit 0
pnpm build (WASM + webpack): exit 0, 1 lần
pnpm exec playwright test world --workers=2: 43 passed (6.3m); exit 0
pnpm check:licenses: public files 123; RESULT: PASS; exit 0
```

Lần chạy unit đồng thời capture có một timeout 15 s ở test CLI cũ `tests/unit/tools/assets.test.ts`. Sau khi đóng review, chạy lại **nguyên `pnpm test`**: 174 files / 1856 tests pass, 73,99 s. Không sửa test cũ, timeout hoặc config.

Build WASM + webpack chạy **đúng một lần**, exit 0. Sau build, kiểm tra hình phát hiện lỗi viewport/scissor của bake impostor; đã sửa tool bake, bake lại 12 impostor, đồng bộ file HR và public manifest vào `out/`, không build lần hai. Mã runtime và 14 mục manifest cũ không đổi. Unit test cuối đọc trực tiếp asset sau sửa. E2e dùng mã runtime từ build này: **43 passed (6.3m)**; Playwright bị kẹt cleanup server trên Windows sau khi mọi test đã xong, nên dừng đúng process server riêng tại cổng 4198; runner kết thúc exit 0.
