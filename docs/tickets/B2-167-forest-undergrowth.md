## TICKET B2-167: tầng dưới rừng dày: dương xỉ, bụi, đá rêu, gỗ đổ, lá khô trên lối

- Được sửa: `src/features/world/foliage/ground.ts` và test (`tests/unit/world/ground.test.ts`).
- Đọc `_forest-common.md` và `_dirA-common.md`.

### Việc

1. **Biome rừng** (`forest-dawn`) có tầng dưới dày:
   - **dương xỉ:** lá xòe, 0,4–1 m;
   - **bụi lá rộng:** 0,6–1,4 m;
   - **đá phủ rêu:** đỉnh xanh, chân xám;
   - **khúc gỗ đổ** phủ rêu, thỉnh thoảng.
   - Hai bên lối mòn (2,5–8 m từ tâm) dày nhất, tạo thành "hành lang xanh". Sâu trong rừng thưa dần để giữ ngân sách.
2. **Lá khô trên lối:** các đốm/mảng lá khô màu `grassDry` pha `flower` (rất ít) rải trên lối mòn, mỏng, sát mặt đất.
   - Không chặn đường; không collider.
   - Đây là decal mỏng, không phải địa hình.
3. **Biome đồi/biển:** giữ như hiện tại, hoặc cỏ thưa.
4. **Không vật cứng trong hành lang** (`PATH_CLEARANCE`). Dương xỉ và bụi không có collider. Gỗ đổ và đá lớn chỉ đặt ngoài hành lang.
5. **Ngân sách:** ≤ 4 draw call cho cả ground details, ≤ 40 000 tam giác trong vùng nhìn 120 m. Dùng instancing.

### Test

- Mật độ dương xỉ và bụi trong dải 2,5–8 m quanh lối ở biome rừng ≥ 3 lần dải 30–60 m.
- Không vật cứng trong hành lang.
- Lá khô chỉ nằm trên lối (≤ 1,6 m từ tâm).
- Tất định.
- Ngân sách.
