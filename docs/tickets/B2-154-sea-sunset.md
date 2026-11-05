## TICKET B2-154: mặt biển phản chiếu hoàng hôn, sóng vỗ nhẹ

- Được sửa: `src/features/world/water/sea.ts`, `src/features/world/water/material.ts` và test (`tests/unit/world/water.test.ts`, `coast.test.ts`).
- Đọc kèm `_coast-common.md`.

### Việc

1. **Vệt phản chiếu mặt trời** trên biển:
   - Một dải lấp lánh hướng từ mặt trời về phía người xem, kiểu tranh màu nước: vệt cam nhạt hoà dần, không bóng loáng như kim loại.
   - Hướng vệt lấy từ hướng nắng hiện có (uniform/tham số từ grade), **không hardcode** (B2-155 có thể chỉnh hướng nắng).
2. **Sóng nhẹ:**
   - Mặt biển gợn chậm (chu kỳ 6–10 s).
   - Một viền bọt trắng mảnh chạy vào bờ rồi rút, chậm và êm.
   - Khi `reducedMotion` bật: sóng và bọt đứng yên, vẫn giữ vệt phản chiếu tĩnh.
3. **Hiệu năng:** chỉ trong shader hiện có (không thêm mesh lớn, không thêm render target). Tam giác của biển không tăng quá 10 %.

### Test

- Shader nhận tham số hướng nắng.
- `reducedMotion` làm thời gian sóng đứng yên.
- Ngân sách tam giác.
