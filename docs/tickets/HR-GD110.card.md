## TICKET HR-GD110 — Xe GD110 siêu thực (đọc HR-common.md trước)

- Lane / milestone: L3 World + asset / B3 hyper-real.
- Hiện trạng: xe là mesh three.js dựng tay (`src/features/world/vehicle/mesh.ts`), nhìn như đồ chơi: bình xăng trơn bóng, lốp không gai rõ, khung ống tròn đều, yên khối hộp, đèn và pô đơn giản.
- Việc:
  1. Dựng GD110 bằng Blender CLI (`tools/assets/blender/hr-gd110*.py`), theo dáng xe côn tay cổ điển 110cc. Gồm:
     - bình xăng có gân và đường hàn; yên da có đường may, chỗ phồng và vết nhăn;
     - lốp cao su có gai và chữ nổi giả, **không có tên hãng**; nan hoa và vành crôm;
     - phanh đùm; xích và nhông; động cơ có cánh tản nhiệt và vỏ nhôm đúc;
     - pô crôm có vệt nhiệt xanh/vàng; đèn pha có chóa phản quang; gương; dây cáp;
     - vết trầy và bụi đường ở chắn bùn.
     PBR với texture CC0 (Poly Haven/ambientCG). **Không logo, không huy hiệu, không chữ Suzuki.**
  2. Giữ nguyên hợp đồng runtime: tên/node pivot của tay lái, bánh trước, bánh sau (để quay bánh và đánh lái), điểm ngồi của người lái, kích thước bao và collider. Nạp GLB deferred sau Enter World (meshopt + KTX2); LOD0 gần, LOD1 xa.
  3. `mesh.ts` giữ làm đường dự phòng cho Low và renderer phần mềm (SwiftShader/llvmpipe), giống HR-TREE2.
- Được sửa: `src/features/world/vehicle/**`, `tools/assets/blender/hr-gd110*`, `public/world/vehicle/` (mới), manifest liên quan, `assets/LICENSES.csv`, test. **Không sửa** `foliage/**`, `props/**`, `zones/**` (HR-PROPS2), `scene/far-*` (HR-FAR), `character/**`.
- Hiệu năng: High ≥ 60 FPS RTX 3060 khi đang lái.
- Xong khi:
  - gate PASS;
  - build 1 lần **sau thay đổi cuối**, rồi e2e world `--workers=2` 43/43 trên build đó (đặc biệt test vehicle: lên/xuống xe, đánh lái);
  - có ảnh High cận cảnh trước/sau ở 4 góc (trước, sau, bên, 3/4), 1 ảnh đang lái trong world, 1 ảnh Low;
  - `check:assets` và `check:licenses` PASS.
- Không commit.
