## TICKET B2-163: đường nhựa ven biển, cột tiêu, cột điện

- Được sửa:
  - **module mới** `src/features/world/road/` (ví dụ `road.ts`, `posts.ts`);
  - test `tests/unit/world/road*.test.ts`.
- Chỉ được đọc, không sửa: `layout/path.ts`, `terrain/height.ts`.
- Đọc `_dirA-common.md`.

### Việc

1. **Mặt đường nhựa** trên đoạn `t` 0,80–1 (đoạn ven biển), bám đúng tâm đường đi (`pathPointAt`):
   - Dải mesh rộng 5 m, nằm trên mặt đất +2 cm để không bị z-fighting. Màu `asphalt`, biến sắc nhẹ.
   - Vạch giữa màu `laneYellow`, nét liền.
   - 2 vạch mép màu `laneWhite`.
   - Hai đầu đoạn nối mềm vào lối đất (fade hoặc thu hẹp dần), không cắt cụt.
   - Đoạn rừng giữ lối đất như cũ.
2. **Cột tiêu** trắng đầu đỏ (`laneWhite` + `vermilion`):
   - cao 0,9 m;
   - đặt ở **mép phải** đường (phía biển), cách nhau 10–12 m;
   - instanced; mỗi cột nghiêng ±2°, tất định.
3. **Cột điện gỗ** ở **bên trái** đường (phía núi):
   - cao 7–8 m, có xà ngang;
   - cách nhau 40–50 m;
   - 2–3 dây điện võng nhẹ nối các cột (line hoặc ống mảnh low-poly).
4. **Va chạm:**
   - Cột tiêu và cột điện là vật cứng nhỏ. Xuất danh sách collider tròn `(x, z, r)` để Lead nối vào physics.
   - **Không** đặt cột trong hành lang đi bộ (`PATH_CLEARANCE`). Cột tiêu đặt sát ngay bên ngoài hành lang.
5. **Ngân sách cả module:** ≤ 4 draw call, ≤ 12 000 tam giác.

### Test

- Vạch nằm trong dải đường.
- Khoảng cách giữa các cột đúng như trên.
- Cột tiêu ở bên phải, cột điện ở bên trái (theo quy ước chung).
- Không cột nào nằm trong hành lang hoặc trên nền khu.
- Không có điểm nào của mặt đường thấp hơn mặt đất tại đó.
- Đúng ngân sách tam giác và draw call.
