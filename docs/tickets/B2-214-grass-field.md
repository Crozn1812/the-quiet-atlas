## TICKET B2-214: đồng cỏ dày gần camera (đồi và ven biển)

- Đọc `_finish-common.md`. Được sửa: tạo `src/features/world/foliage/grass-field.ts` (module mới), test mới. Lead sẽ nối (ghi đoạn mã nối mẫu ≤ 15 dòng).

### Vấn đề

- Đồi và bãi ven biển là **mảng màu trơn**, vài túm cỏ lẻ → nhìn như sàn nhựa.

### Việc

1. Lớp cỏ instanced quanh người chơi (bán kính 25 m High / 15 m Balanced / tắt Low), tái dùng instance khi di chuyển (vòng tròn cuốn theo camera, lưới 0,35–0,5 m có jitter theo seed vị trí), chỉ ở biome `hill`/`coast-dusk` và rìa rừng; không trên đường nhựa, lối, nước, nền khu.
2. Mỗi instance là 1 lá cỏ 3–5 tam giác, cao 0,25–0,6 m, cong, gốc tối ngọn sáng (`grass` → `grassDry`), lay gió (dùng uniform gió hiện có hoặc riêng; tắt khi reducedMotion).
3. Mờ dần theo khoảng cách (scale về 0) để không thấy mép vòng.
4. Ngân sách: ≤ 1 draw call; ≤ 60 000 tam giác ở High; cập nhật mỗi frame ≤ 1 ms trên Node (đo).

### Test

- Không lá cỏ nào trên đường nhựa/lối/nước/nền khu (lấy mẫu).
- Tam giác, draw call theo quality; tất định theo vị trí; dịch chuyển 10 m chỉ cập nhật phần mới vào vòng.
