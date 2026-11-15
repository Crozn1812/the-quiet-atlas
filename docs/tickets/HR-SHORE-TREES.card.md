## TICKET HR-SHORE-TREES — Phi lao ven biển thật (đọc HR-common.md trước; tách từ HR-PROPS2)

- Lane / milestone: L3 World + asset / B3 hyper-real.
- Hiện trạng (sau HR-PROPS2, ảnh `compare-return1-quiet-shore-high.png`, `compare-return1-last-postcard-high.png` trong `W-B/tools/styleframes/.vite/test-results/hr-props2/`): cây ven biển Quiet Shore và Last Postcard là **tán tròn đặc như cây kẹo mút**, màu xanh đậm đều, không ra dáng loài nào.
- Việc: tạo bằng Blender CLI (CC0 texture) **phi lao (Casuarina equisetifolia)**:
  - thân thẳng cao 8–15 m, vỏ xám nâu bong vảy dọc;
  - cành chếch lên;
  - tán hình nón thưa, không đặc;
  - "lá" là các chùm cành kim mảnh rủ xuống mềm, màu xanh xám, có khe hở để thấy trời.
  
  Làm 3 biến thể (cây non, trưởng thành, nghiêng gió), có LOD0/LOD1/impostor, meshopt và KTX2. Trồng thành **hàng chắn gió** dọc bờ, khoảng cách không đều, xen vài cây keo lá tràm. Thay các tán tròn hiện tại ở Quiet Shore và Last Postcard.
- Được sửa: `public/world/lib/hr-tree-casuarina-*` (mới), `tools/assets/blender/hr-casuarina*`, manifest (thêm), phần chọn cây ven biển trong `src/features/world/foliage/**` và `zones/quiet-shore*`, `zones/last-postcard*`, `assets/LICENSES.csv`, test. **Không sửa** `terrain/**` (HR-GROUND), `sky/**` (HR-SKY), `scene/far-*`, `vehicle/**`, `post/**`.
- Hiệu năng: High ≥ 60 FPS RTX 3060 ở Quiet Shore và Last Postcard.
- Xong khi:
  - gate PASS;
  - build 1 lần **sau thay đổi cuối**, rồi e2e world `--workers=2` 43/43 trên build đó;
  - có ảnh High trước/sau cùng góc ở 2 khu, 1 ảnh cận thân và tán, 1 ảnh Low;
  - `check:assets` và `check:licenses` PASS.
- Không commit.
