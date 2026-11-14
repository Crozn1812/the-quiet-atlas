## TICKET HR-PROPS2 — Hết low-poly ở High: cây đồi, cây biển, cỏ (đọc HR-common.md trước)

- Lane / milestone: L3 World / B3 hyper-real. Tiếp HR-PROPS (đã merge: kho `hr-prop-*`, `hr-rock-*`, `hr-palm-*` và runtime PBR prop).
- Còn thấy rõ ở High (ảnh `D:/tqa-worktrees/W-C/test-results/hr-props/after/*.png`):
  1. **Cây nón/thông low-poly** trên đồi Horizon và dọc bờ Quiet Shore (`foliage/tree-pine-*`, `lib/tree-pine-*`).
  2. **Cây tán dù phẳng nhiều mặt** trên sườn Last Postcard (`lib/tree-broadleaf-*`/`foliage/tree-broadleaf-*`).
  3. **Cỏ nhọn đen** dày đặc như tam giác nhỏ ở Milestones/Old Trail và cỏ thưa nhọn ở Horizon (hệ cỏ toàn cục cũ), lệch với cỏ dày HR-LIGHT.
  4. Đá bậc/đá tương tác và gỗ cấu trúc còn bản cũ (HR-PROPS ghi lại).
- Việc: thay toàn bộ hệ cây/cỏ toàn cục cũ ở High bằng kho HR (HR-TREE1 cây; `hr-palm-*`, `hr-prop-*` mới; cỏ dùng hệ cỏ dày HR-LIGHT hoặc mở rộng nó), đúng sinh cảnh (đồi khô: cây thưa tán rộng, bụi; ven biển: cọ, phi lao/dương; rừng: kho HR). Đá/gỗ tương tác: đổi mesh/vật liệu sang HR, **giữ collider và vị trí**. Low có thể giữ bản rẻ.
- Được sửa: `src/features/world/foliage/**`, `props/**`, `zones/*-dressing.ts`, `zones/workshop.ts`, `public/world/lib/` (thêm), manifest, `tools/assets/blender/hr-props*`, `assets/LICENSES.csv`, test. **Không sửa** `scene/far-*` (HR-FAR), `public/world/lib/hr-tree-bamboo-*` và phần tre trong `tools/assets/blender/hr-trees*` (HR-TREE1b), `post/**`, `zones/roots*`.
- Hiệu năng: High ≥ 60 FPS RTX 3060; renderer phần mềm giữ đường dự phòng như HR-TREE2.
- Xong: gate PASS; build 1 lần **sau thay đổi cuối**; e2e world `--workers=2` 43/43 trên build đó; ảnh High trước/sau cùng góc cho 8 khu (nêu rõ còn vật low-poly nào ở High, nếu có, kèm lý do); `check:assets`/`check:licenses` PASS. Không commit.
