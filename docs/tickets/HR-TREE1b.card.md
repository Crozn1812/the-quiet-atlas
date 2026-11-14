## TICKET HR-TREE1b — Tre/trúc thật (đọc HR-common.md trước)

- Lane / milestone: L3 asset / B3 hyper-real.
- Bối cảnh: trong kho HR-TREE1, `hr-tree-bamboo-clump` và `hr-tree-bamboo-arching` trông như **bụi cây tròn lá dày**, không ra tre (xem ảnh ghép HR-TREE1). Tre Việt Nam: **khóm nhiều thân** (culm) xanh vàng có **đốt** rõ, thân cao 8–15 m **cong vồng ra ngoài** ở ngọn, cành nhỏ mọc từ đốt, **lá mảnh dài** thành chùm thưa, nhìn xuyên được; gốc có măng, bẹ khô, lá tre rụng.
- Việc: làm lại 2 biến thể (khóm đứng, khóm vồng) + 1 biến thể tre ven suối, trong Blender CLI (geometry nodes/script), texture thân tre và lá CC0 (Poly Haven/ambientCG, ghi LICENSES.csv). Giữ **đúng tên file và hệ LOD** hiện có (`public/world/lib/hr-tree-bamboo-*-lod0/lod1/impostor.glb`) để runtime HR-TREE2 dùng ngay; thêm biến thể mới vào manifest nếu runtime đọc manifest. Gió: lá lay mạnh hơn thân (vertex color/attribute đánh dấu như các cây HR khác).
- Được sửa: `tools/assets/blender/hr-trees*` (phần tre), `public/world/lib/hr-tree-bamboo-*`, `public/world/lib/manifest.json`, `assets/LICENSES.csv`, test manifest. Không sửa `src/**`.
- Xong: ảnh từng biến thể High (như ảnh HR-TREE1) + ảnh trong game ven suối First Light trước/sau; tam giác/byte; gate PASS; build 1 lần sau thay đổi cuối; e2e world 43/43 trên build đó; `check:assets`/`check:licenses` PASS. Không commit.
