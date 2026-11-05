## TICKET B2-168: cầu gỗ có tay vịn ở các chỗ đường cắt suối

- Được sửa: **module mới** `src/features/world/bridges/` và test `tests/unit/world/bridges*.test.ts`.
- Chỉ được đọc, không sửa: `layout/path.ts` (`PATH_BRIDGES`), `terrain/height.ts`, `water/*`.
- Đọc `_forest-common.md` và `_dirA-common.md`.

### Việc

1. Mỗi phần tử của `PATH_BRIDGES` có **một cây cầu gỗ**:
   - Mặt cầu ghép từ các khúc gỗ/thanh tre ngang. Màu `rockDark` pha `dusk`, mỗi thanh lệch màu nhẹ.
   - Hai bên có tay vịn gỗ/tre: cột cách 1,2–1,6 m, thanh vịn hơi cong vênh tự nhiên.
   - Có rêu nhẹ ở mép.
   - Chiều dài phủ kín đoạn `tStart`–`tEnd` (cộng thêm 1 m mỗi đầu), bám theo đường cong của đường đi.
   - Rộng lòng cầu 2,2 m. Mặt cầu cao hơn mặt nước ≥ 0,4 m; hai đầu chạm đất mượt (dốc ≤ 12°).
2. **Va chạm:**
   - Xuất mesh/collider mặt cầu để Lead nối vào physics (nhân vật đi trên được).
   - Tay vịn là collider chặn rơi.
   - Không chặn lối đi giữa hai tay vịn.
3. **Ngân sách:** ≤ 3 draw call cho mọi cầu, ≤ 6 000 tam giác tổng.

### Test

- Mỗi bridge có mesh.
- Mặt cầu cao hơn mực nước tại tâm.
- Độ dốc hai đầu ≤ 12°.
- Khoảng trống giữa hai tay vịn ≥ 2 m.
- Collider nằm đúng chỗ.
- Tất định.
- Ngân sách.
