## TICKET HR-PROPS — Thay phần còn low-poly: bụi, dương xỉ, đá, cây đồi/biển (đọc HR-common.md trước)

- Lane / milestone: L3 World + asset / B3 hyper-real.
- Bối cảnh: sau HR-TREE2 rừng đã siêu thực, nhưng ảnh các khu vẫn còn nhiều vật low-poly lộ rõ: **bụi cây/dương xỉ xanh đen nhiều mặt phẳng** (`lib/prop-bush-*`, `prop-fern-*`), **đá tảng góc cạnh** (`lib/rock-boulder-*`, `props/rock-*`), **cây trên đồi Horizon và cây/cọ ở Quiet Shore, Last Postcard** (`foliage/tree-*`, `lib/tree-broadleaf-*`, `lib/tree-pine-*` dạng nón), khúc gỗ (`prop-log`, `prop-fallen-log`), cỏ nhọn thưa trên đồi.
- Việc:
  1. Tạo (Blender CLI, CC0 texture Poly Haven/ambientCG) bản **hr-** cho: 4 loại bụi nhiệt đới (lá to, lá kim, bụi hoa dại, bụi tre non), 3 loại dương xỉ, 6 đá (tảng, đá suối tròn, đá phiến, có rêu), 2 khúc gỗ mục có nấm/rêu, **cọ dừa/cọ biển** 3 biến thể cho bờ biển, 4 cây đồi (dùng lại kho HR-TREE1 được thì dùng). LOD0/LOD1(/impostor cho cây), meshopt + KTX2, nạp deferred.
  2. Thay ở dressing các khu (Horizon, Quiet Shore, Last Postcard, Old Trail, Workshop, Milestones) để **không còn vật low-poly cũ ở High**; Low có thể giữ bản rẻ.
  3. Giữ collider, vị trí điểm tương tác, lối đi; không che bảng/biển chỉ đường.
- Được sửa: `public/world/lib/hr-prop-*`, `hr-rock-*`, `hr-palm-*`, `public/world/lib/manifest.json` (thêm), `tools/assets/blender/hr-props*`, `src/features/world/zones/*-dressing.ts` và `props/**` (chỉ chọn asset), `assets/LICENSES.csv`, test. **Không sửa** `foliage/**` (HR-LIGHT đang làm mặt đất/cỏ), `zones/roots*.ts` (HR-ROOTS-TREE), `post/**`.
- Hiệu năng: giữ High ≥ 60 FPS RTX 3060 như PERF-HR (instancing, LOD, không đổ bóng ở xa); ghi số trước/sau.
- Xong: gate PASS; build 1 lần **sau thay đổi cuối**; e2e world `--workers=2` 43/43 trên build đó; ảnh High trước/sau cùng góc cho 6 khu + Low; `check:assets`, `check:licenses` PASS. Không commit.
