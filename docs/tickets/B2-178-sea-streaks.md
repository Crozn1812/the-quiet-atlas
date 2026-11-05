## TICKET B2-178: bỏ các vệt trắng thẳng trên biển gần chân trời

- Được sửa: `src/features/world/water/material.ts` và test nước/biển.
- Đọc `_dirA-common.md`.

### Lead thấy trên ảnh

Ở góc rộng Quiet Shore, gần chân trời có **các vệt trắng thẳng như tia** chạy từ một điểm ra mặt biển. Có thể đó là vệt phản chiếu hoặc lấp lánh bị kéo dài, hoặc bọt sóng bị nội suy sai ở xa.

### Việc

1. Tìm nguồn của các vệt (glimmer, wash hay foam) và sửa:
   - vệt hoàng hôn phải loang mềm, thành đốm/vạch ngắn ngang;
   - không có tia thẳng dài;
   - càng xa càng mảnh và mờ dần theo phối cảnh.
2. Bọt sóng chỉ có ở sát bờ (≤ 5 m), không xuất hiện ngoài khơi.
3. Màu xanh ngọc của B2-174 giữ nguyên.

### Test

- Mô phỏng trên CPU dọc một tia nhìn về chân trời: không có dải sáng liên tục dài > 40 m theo hướng tia.
- Bọt bằng 0 ở xa bờ > 6 m.
- Test cũ pass.
