## TICKET B2-152: địa hình bờ biển: núi bên trái, vịnh cong bên phải

- Được sửa: `src/features/world/terrain/height.ts`, test mới `tests/unit/world/coast-shape.test.ts`, và các test địa hình hiện có nếu kỳ vọng phải đổi (ghi lý do).
- Đọc kèm `_coast-common.md`.

### Việc

1. **Núi phía đất liền**, bên trái hướng đi trên đoạn `t` 0.82–1:
   - Sườn dâng dần từ khoảng 25 m cách mép đường lên đỉnh cao 35–55 m so với mặt đường, ở khoảng 80–140 m.
   - Sườn mềm, không vách đứng (độ dốc ≤ 35° trong 40 m đầu kể từ đường).
2. **Vịnh cong phía biển**, bên phải:
   - Đường bờ thành một vòng cung lõm. Nhìn từ đường, bờ cong ra xa rồi vòng lại (mũi đất thấp ở cuối tầm nhìn), không còn là đường gần thẳng chỉ có nhiễu.
   - Giữ bãi thoải hiện có, nước sâu dần.
3. **Giữ nguyên:**
   - Hành lang đường đi: độ cao, khoảng hở so với nước, cầu và ford.
   - Nền của khu Quiet Shore và Last Postcard: các test đặt khu trên địa hình thật phải pass, khu dựng không lỗi.
   - Cửa sông và suối ở đoạn ven biển (test river-terrain và river-source).
   - Hàm vẫn thuần, tất định, không phụ thuộc thứ tự gọi.

### Test mới

- Lấy mẫu dọc đường ở `t` 0.85, 0.9, 0.95:
  - phía trái cách 100 m cao hơn mặt đường ≥ 30 m;
  - phía phải cách 60 m là dưới mực biển.
- Đường bờ (độ cao 0) đo ở 5 điểm dọc đoạn bờ tạo thành cung lõm: điểm giữa lùi vào đất liền ≥ 25 m so với dây cung nối hai đầu.
- `placeZoneScenes(surfaceHeight)` không ném lỗi.
