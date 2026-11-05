## TICKET B2-170: rừng lá rộng là chính, tán khép dọc lối, thân cây không đen

- Được sửa: `src/features/world/foliage/scatter.ts`, `src/features/world/foliage/instances.ts` và test foliage.
- Đọc `_forest-common.md` và `_dirA-common.md`.

### Lead thấy trên ảnh (sau B2-166/167)

- Rừng vẫn gần toàn thông: cây cao trong biome rừng 88 % là thông. Cây lá rộng phủ rêu của B2-166 rất ít.
- Cây thưa, lối đi trống trải, không có cảm giác "hành lang rừng".
- Thân cây gần như đen.

### Việc

1. **Biome `forest-dawn`, tính theo khoảng cách tới đồi cỏ:**
   - Sâu trong rừng: lá rộng ≥ 75 %, thông ≤ 25 %.
   - Rìa rừng giáp đồi (`hill`), trong khoảng 40 m: thông ≥ 60 % (dáng Đà Lạt).
2. **Dọc lối mòn, từ 4 m đến 25 m mỗi bên:**
   - Cây lá rộng dày hơn, tán gần khép trên đầu ở nhiều đoạn, cành vươn ra phía lối.
   - Vẫn chừa trời ở các khoảng trống của khu (`ZONES`) và ở những chỗ có vệt nắng (B2-169).
3. **Thân cây:**
   - Màu từ `rock`/`rockDark` pha `forestDeep`; rêu theo B2-166.
   - Luma của thân ≥ 0,18 sau tone mapping ước lượng, tức không đen.
   - Đọc màu thân từ preset (`WORLD_DIRECTION.foliage.trunk`), không hardcode.
4. **Ngân sách:** tổng instance trong vùng 240 m ≤ trần cũ × 1,25. Draw call không đổi.

### Test

- Tỉ lệ loại cây theo vùng (sâu trong rừng / rìa rừng).
- Mật độ tán trong dải 4–25 m quanh lối ≥ 2 lần dải 60–120 m.
- Luma màu thân.
- Ngân sách instance.
- Tất định.
