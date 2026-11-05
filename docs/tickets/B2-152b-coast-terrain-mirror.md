## TICKET B2-152b: địa hình bờ biển bị NGƯỢC BÊN. Núi phải ở bên TRÁI người đi

- Được sửa: `src/features/world/terrain/height.ts`, `tests/unit/world/coast-shape.test.ts`, và các test địa hình/bờ biển khác nếu kỳ vọng phải đổi (ghi lý do từng test).
- Đọc kèm `_coast-common.md` và `B2-152-coast-terrain.md` (bản vòng 1 đã merge ở `cbc787c`).

### Lỗi của vòng 1 (Lead đo trên main)

Trên đoạn `t` 0.82–1, người chơi đi **về phía biển**, hướng đi khoảng (−0,47; −0,88), tức là −Z.

- Trong three.js (trục y hướng lên), với hướng đi `f = (fx, fz)`:
  - **bên phải** người đi là `(−fz, fx)`;
  - **bên trái** là `(fz, −fx)`.
- Ví dụ: đi về −Z, tức `f = (0, −1)`, thì bên phải là +X.
- Vòng 1 dùng quy ước ngược lại. Kết quả hiện tại:
  - núi 45 m nằm bên **phải**;
  - vịnh, mực nước −2,5 m, nằm bên **trái**.

Đo tại `t` = 0,85: bên phải 100 m cao 45 m, bên trái 100 m cao −2,5 m. Mô tả của Duy là ngược lại.

### Việc

1. **Lật cảnh:**
   - núi rừng ở **bên trái** người đi, dùng vectơ `(fz, −fx)`;
   - vịnh cong ở **bên phải**, dùng `(−fz, fx)`.
   - Thông số giữ như vòng 1: núi cao 35–55 m, đỉnh cách đường 80–140 m, sườn ≤ 35° trong 40 m đầu; vịnh lõm ≥ 25 m so với dây cung.
2. **Test `coast-shape`:** dùng đúng quy ước trên, và **có 1 test tự kiểm quy ước**: với `f = (0, −1)`, vectơ "phải" của helper phải là (+1, 0).
3. **Các ràng buộc khác vẫn giữ:**
   - đường đi, cầu, ford;
   - nền khu Quiet Shore/Last Postcard (`placeZoneScenes(surfaceHeight)` không lỗi);
   - cửa sông, bờ suối quanh Horizon ≤ 35°;
   - mực nước biển, các test `coast.test.ts` và `river-terrain.test.ts`.
   - Đổi chỗ đặt núi/vịnh mà đụng ràng buộc nào thì **sửa hình** (dời elip vịnh, thu hẹp đầu/cuối núi), không nới ngưỡng test.
   - Nếu một test cũ đo điểm cố định mà nay nằm trong vịnh hoặc núi thì được đổi điểm đo, ghi lý do.
4. Ghi trong bàn giao: số đo độ cao trái/phải 60 m và 100 m tại `t` 0,85, 0,9, 0,95.
