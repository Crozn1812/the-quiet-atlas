## TICKET B2-155: ánh hoàng hôn ấm và sương trên rừng núi

- Được sửa: `src/features/world/sky/grade.ts`, `src/features/world/sky/dome.ts` và test của chúng (`tests/unit/world/sky.test.ts`, test grade/direction nếu có).
- Đọc kèm `_coast-common.md`.

### Việc

1. **Grade `coast-dusk`:** hoàng hôn ấm, dịu.
   - Mặt trời thấp sát chân trời biển, nằm **bên phải** hướng đi (phía biển, hơi về trước) để phản chiếu trên biển nhìn thấy từ đường.
   - Chân trời cam hồng nhạt, đỉnh trời xanh tím nhạt (`indigo`/`mist`).
   - Không bão hoà gắt, không tối đến mức mất chi tiết.
   - Giữ `far` fog khoảng 400 m (B2-143) để thấy chân trời biển.
2. **Sương ở phía núi:** dùng tham số fog/height-fog sẵn có hoặc tông chân trời. Rừng bên trái mờ dần theo độ cao và khoảng cách ("mù mờ, bí ẩn"), biển bên phải vẫn trong.
   - Không thêm pass. Nếu cần lớp sương, tối đa 1 mesh mặt phẳng trong suốt rẻ, ≤ 1 draw call.
3. **Chuyển biome:** từ hill sang coast-dusk vẫn mượt như hiện tại.

### Test

- Hướng nắng ở coast-dusk có thành phần hướng ra biển (−Z) và độ cao mặt trời thấp (≤ 12°).
- Màu chân trời nằm giữa `dusk` và `flower`.
- Test chuyển biome cũ vẫn pass.
