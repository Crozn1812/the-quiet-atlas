## TICKET B2-160: vệt hoàng hôn trên biển nhìn rõ từ đường

- Được sửa: `src/features/world/water/material.ts`, `src/features/world/water/sea.ts` và test nước/biển.
- Đọc `_coast-r2-common.md` mục 2.

### Việc

1. Vệt phản chiếu (wash) hiện quá nhạt: tăng tới mức thấy rõ nhưng vẫn kiểu màu nước.
   - Vệt ấm hơn (`dusk` + một chút `flower`). Lõi sáng gần mặt trời, loang rộng về phía người xem.
   - Lấp lánh đứt đoạn (các vạch ngang ngắn), không bóng gương.
2. Màu biển gần bờ hơi ấm theo grade hoàng hôn; xa bờ xanh tím.
3. Bọt sóng vẫn nhẹ và chậm. `reducedMotion` giữ như cũ. Vẫn tắt bọt nơi bờ dốc (`SEA_FOAM_MAX_SLOPE`).

### Test thay mắt

- Với camera ở (0, 1,7, −860), mặt trời hướng `(0,8; 0,14; −0,6)`, tính màu shader trên CPU (hàm mô phỏng có sẵn trong test, hoặc tách công thức thành hàm TS dùng chung):
  - điểm biển trên trục mặt trời cách 80 m có luma cao hơn điểm lệch trục 40 m ≥ 0,10;
  - màu ấm hơn (R − B lớn hơn).
- Không thêm texture hay render target. Uniform sea ≤ 140 float.
