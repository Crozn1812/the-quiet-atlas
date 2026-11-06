## TICKET B2-198: cây vòm lối có cành lớn thật vươn ra lối (tán khép trên lối, không kéo dãn cành)

- Được sửa: `src/features/world/foliage/shapes.ts` (thêm biến thể tán cho cây vòm), `src/features/world/foliage/instances.ts` (chỗ chọn geometry/`canopyShift` cho `trailCanopy`), test foliage.
- Đọc `B2-196-trail-canopy-trees.md`, `_asset-common.md`. Ảnh: `docs/showcase/26-asset-ky/lead-review/` (sẽ thêm `trail-wire-lines.webp`).

### Bối cảnh (Lead, 2026-11-06)

- B2-196 dịch khối lá của cây vòm sang ngang `reach` (tới 5–10 m) và **kéo dãn các cành con** từ thân → render thành hàng chục vạch mảnh như dây điện ngang trời. Lead đã chặn `reach ≤ 3 m` (hết vạch) nhưng tán chỉ phủ 2/72 điểm tâm lối (mục tiêu B2-196 là ≥ 25/72).

### Việc

1. Thêm geometry riêng cho cây vòm: 2–3 **cành lớn** (gỗ, gốc dày ≥ 0,18 m, thuôn) mọc từ thân ở 55–70 % chiều cao, vươn chéo lên về phía lối 3–6 m; cụm lá treo ở đầu và dọc các cành này. Không kéo dãn hình học lúc chạy (`canopyShift` = 0 hoặc bỏ cho biến thể này).
2. Tán khép trên lối: ≥ 25/72 điểm mẫu tâm lối (test hiện có) mà không có cạnh gỗ nào dài > 6 m hoặc mảnh hơn 0,05 m.
3. Ngân sách: biến thể ≤ 700 tam giác; hành lang High không quá trần +25 %.

### Test

- Không có tam giác gỗ nào có cạnh > 6 m (trong không gian thế giới, sau ma trận instance).
- Coverage tâm lối ≥ 25/72; mọi test foliage khác pass.
