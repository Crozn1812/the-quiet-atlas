## TICKET B2-165: màu địa hình tự nhiên: cỏ xanh vàng, vách đá theo độ dốc, cát gần nước

- Được sửa: `src/features/world/terrain/mesh.ts` (màu đỉnh) và `tests/unit/world/terrain-mesh.test.ts`.
- Đọc `_dirA-common.md`.

### Việc

1. **Cỏ:**
   - Pha `grass` với `grassDry` theo noise lớn (30–80 m) và theo độ cao.
   - Sườn hướng nắng hơi vàng hơn.
   - Không còn một mảng màu phẳng.
2. **Đá theo độ dốc:**
   - Dốc > 35° chuyển dần sang `rock`/`rockDark`. Đây là vách đá trên núi bên trái và các mỏm.
   - Chuyển màu mềm, mép có răng cưa tự nhiên theo noise.
3. **Gần nước:**
   - Từ 0 đến 1,2 m trên mực nước: `sand` pha `rock`.
   - Dưới nước: `rockDark` pha `seaDeep`, để nhìn qua nước thấy đáy nông có màu.
4. **Lối đất trong rừng** (phần không có đường nhựa): giữ màu đất nâu nhạt hiện có. Nếu chưa có thì dùng `grassDry` pha `rockDark`.
5. **Hiệu năng:**
   - Chỉ tính màu một lần khi dựng tile.
   - Không thêm attribute nào ngoài `color`.

### Test

- Mẫu ở độ dốc 45° có màu gần `rock`.
- Mẫu phẳng giữa đồng cỏ có màu gần `grass`/`grassDry`.
- Mẫu sát mép nước có màu gần `sand`.
- Trong 200 m, độ lệch chuẩn luma của màu cỏ ≥ 0,03.
- Kết quả tất định.
