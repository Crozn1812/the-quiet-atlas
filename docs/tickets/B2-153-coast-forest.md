## TICKET B2-153: rừng dày, mù mờ trên núi phía trái

- Được sửa: `src/features/world/foliage/scatter.ts` và test của nó (`tests/unit/world/foliage*.test.ts`).
- Đọc kèm `_coast-common.md`.

### Việc

1. **Biome `coast-dusk`, phía đất liền của đường** (bên trái theo hướng đi, cách đường 22–160 m):
   - Rừng tán dày, khép kín. Ít nhất 60 % tán tông `forestDeep`.
   - Mật độ cao hơn rừng thường: nhìn từ đường thấy một khối tán liền, lớp lớp lên sườn.
   - Xác định phía đất liền theo pháp tuyến đường và hướng ra biển (−Z), **không** phụ thuộc hình núi cụ thể (B2-152 đang sửa địa hình song song).
   - Cây đặt theo `heightAt` như hiện tại.
2. **Phía biển** của đường giữ thoáng: chỉ cỏ thưa và cây bụi thấp, không cây cao chắn tầm nhìn ra biển.
3. **Ngân sách:** tổng số instance không vượt trần hiện có. Muốn dày lên phía trái thì bớt ở chỗ khuất tầm nhìn (sâu trong rừng nội địa xa đường).

### Test

- Đếm instance cây cao trong dải bên trái so với dải bên phải ở đoạn `t` 0.85–0.97: trái ≥ 4 lần phải.
- Không cây cao nào trong 40 m phía biển của đường trên đoạn đó.
- Tổng instance ≤ trần cũ.
