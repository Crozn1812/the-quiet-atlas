## TICKET B2-219b: gợn nước bớt "vải nhung kẻ"

- Đọc `B2-219-water-surface.md`, `B2-221-forest-stream.md`. Được sửa: `src/features/world/water/material.ts`, test nước.
- Ảnh **trong game**: `docs/showcase/27-hoan-thien-1/ingame/old-trail.webp`, `horizon.webp`, `quiet-shore.webp`. Suối và biển phủ kín **vệt sáng song song dài, đều, đặc** như vải nhung kẻ; nhìn máy móc, nổi hơn cả cảnh xung quanh.

### Việc

1. Vệt gợn thành **đoạn ngắn đứt quãng** (dài 0,5–2 m), mật độ thưa hơn 50–70 %, độ sáng vệt giảm còn 40–60 %.
2. Giảm dần theo khoảng cách (từ 15 m mờ dần, 40 m gần như mất) để không thành sọc đều ở xa.
3. Gợn chỉ rõ ở chỗ nông/hẹp, gần như phẳng ở giữa dòng rộng.
4. Giữ bọt mép B2-219, phản chiếu B2-181c, màu suối rừng B2-221.

### Test

- CPU: tỉ lệ diện tích "vệt" (pixel mặt nước sáng hơn nền > 15 %) trong cửa sổ 6 × 6 m ở 10 m: 4–15 % (đo trước/sau, báo cả hai).
- Ở 40 m: biên độ vệt ≤ 20 % của ở 10 m.
- Không có vệt liên tục > 3 m. Test nước cũ pass.
