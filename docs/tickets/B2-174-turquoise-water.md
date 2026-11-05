## TICKET B2-174: biển xanh ngọc, suối trong

- Được sửa: `src/features/world/water/material.ts` và test nước/biển.
- Đọc `_dirA-common.md`.

### Việc

1. **Biển:**
   - Gần bờ màu `seaShallow` (xanh ngọc nhạt), xa bờ chuyển dần sang `seaDeep`, theo khoảng cách tới đường bờ đã lấy mẫu (`uShoreZ`).
   - Vệt hoàng hôn (B2-160) và bọt sóng giữ nguyên.
2. **Suối:**
   - Trong hơn: lòng suối nông có màu xanh lá-ngọc nhạt (`seaShallow` pha `forestLight`), giữa dòng đậm hơn.
   - Bỏ ánh tím/hồng hiện tại.
3. Không thêm texture hay render target. Uniform giữ trong giới hạn hiện có.

### Test

- Màu biển (CPU, mô phỏng) ở 5 m từ bờ gần `seaShallow`; ở 300 m gần `seaDeep`.
- Màu suối không có tông tím: B ≤ G + 0,05.
- Các test cũ pass.
