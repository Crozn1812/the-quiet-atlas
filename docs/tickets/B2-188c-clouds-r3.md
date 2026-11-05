## TICKET B2-188c: mây vòng 3 (bớt "bỏng ngô")

- Được sửa: `src/features/world/sky/dome.ts` (phần mây), `tests/unit/world/sky.test.ts`.
- Đọc `B2-188-painted-clouds.md`, `B2-188b-clouds-r2.md`. Ảnh: `docs/showcase/26-asset-ky/lead-review/t10a-sheet.webp`.

### Lead thấy

- Mây đã hết lặp hàng (tốt). Nhưng giờ là **hàng trăm đám nhỏ cỡ gần bằng nhau** phủ kín trời, như bỏng ngô; nhìn bận, không "im lặng" (taste §5.4 UI im lặng, nhiều khoảng trống).

### Việc

- Ít đám hơn, to hơn: trên toàn bầu trời nhìn thấy (một khung 55° FOV) có **4–9 đám chính** + vài đám nhỏ vụn ở chân trời. Đám chính rộng 15–40° phương vị.
- Độ phủ giữ 20–35 %. Phân bố cỡ lệch: vài đám rất lớn, nhiều đám nhỏ (luỹ thừa).
- Khoảng trời trống lớn giữa các đám (ít nhất một vùng trống ≥ 30° trong mỗi khung).
- Giữ màu/ánh sáng và các test chống lặp của B2-188b.

### Test

- Đếm vùng liên thông trong khung 55° × 30° hướng t = 0,15 / 0,55 / 0,86 (yaw 0): 4–15 vùng; vùng lớn nhất ≥ 4 lần vùng trung vị.
- Có vùng trống liên tục ≥ 30° trong mỗi khung.
- Test sky cũ pass.
