## TICKET B2-164: bờ đá cuội, tảng đá, bãi cát, đá xếp chồng

- Được sửa: **module mới** `src/features/world/shore/` và test `tests/unit/world/shore*.test.ts`.
- Chỉ được đọc, không sửa: `terrain/height.ts`, `water/*`.
- Đọc `_dirA-common.md`.

### Việc

1. **Dải đá cuội** dọc mép nước của toàn bờ biển và vịnh (mép nước là nơi `worldHeight` = 0):
   - đá nhỏ 0,1–0,4 m, instanced, màu pha từ `rock`, `rockDark` và `sand`;
   - dày nhất trong khoảng ±4 m quanh mép nước, thưa dần khi lên bờ;
   - một phần đá nằm dưới nước nông, nhìn thấy qua mặt nước.
2. **Tảng đá lớn** 0,8–2,5 m:
   - đi thành cụm 2–5 tảng, rải ở mép nước và ở chân núi bên trái;
   - hình khối vát, nhiều mặt, không phải hình cầu.
3. **Bãi cát** màu `sand`:
   - là vật trang trí phủ mỏng (decal hoặc mesh mỏng bám theo đất); không sửa địa hình;
   - vài đoạn bãi rộng 6–15 m trong vịnh.
4. **Đá xếp chồng** (cairn):
   - 1–2 chồng, mỗi chồng 5–7 viên, cao 1–1,4 m;
   - đặt trên sườn cỏ cạnh đường, đoạn `t` 0,86–0,9;
   - nằm ngoài hành lang đường đi và ngoài nền khu.
5. **Collider:** tảng lớn và cairn xuất danh sách collider để Lead nối. Đá cuội không cần collider.
6. **Ngân sách:** ≤ 4 draw call, ≤ 25 000 tam giác (dùng instancing).

### Test

- Mọi viên đá cuội nằm trong ±10 m quanh mép nước.
- Không tảng lớn nào nằm trong hành lang hoặc trên nền khu.
- Cairn đúng đoạn `t` và nằm trên đất khô.
- Kết quả tất định.
- Đúng ngân sách.
