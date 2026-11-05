## TICKET B2-172: đường nhựa trông thật: xám nhựa, lề sỏi, vạch đúng tỉ lệ

- Được sửa: `src/features/world/road/` và `tests/unit/world/road.test.ts`.
- Đọc `_dirA-common.md`.

### Lead thấy trên ảnh

- Mặt đường gần như **đen tuyền** khi đứng trên đường.
- Không có lề; đường cắt thẳng vào nền đất.

### Việc

1. **Mặt nhựa:**
   - Màu `asphalt` sáng hơn sau shading. Đứng trên đường nhìn xuống, luma ≥ 0,22.
   - Có biến sắc nhẹ: vệt bánh xe sáng hơn, vá đường tối hơn; vertex color theo noise.
2. **Lề sỏi** rộng 0,6–1 m mỗi bên, màu `rock` pha `sand`, mép ngoài lẫn vào cỏ.
3. **Vạch:**
   - Vạch giữa vàng rộng 0,12 m; vạch mép trắng 0,1 m.
   - Vạch mờ nhẹ (sơn cũ) vài đoạn.
4. **Ngân sách:** draw call không tăng, tam giác ≤ 14 000.

### Test

- Luma mặt đường dưới ánh nắng chuẩn của grade bờ biển (tính trên CPU).
- Lề nằm đúng giữa mép đường và cỏ.
- Bề rộng các vạch.
- Ngân sách.
