## TICKET B2-221: suối rừng lúc bình minh đọc như tấm bê tông xám

- Đọc `_finish-common.md`, `B2-181c-water-reflection.md`, `B2-219-water-surface.md`.
- Được sửa: `src/features/world/water/material.ts`, test nước.
- Ảnh: `docs/showcase/27-hoan-thien-1/lead-review/spawn-view.webp` (góc nhìn spawn, t ≈ 0): dải bên trái lối là **suối**, nhưng nhìn như mặt đường bê tông xám phẳng, không có màu nước, không thấy gợn.

### Việc

1. Ở rừng bình minh, suối phải đọc là **nước**: sắc xanh rêu–ngọc tối (`forestDeep` pha `seaShallow`), phản chiếu trời đào nhạt ở góc nhìn sát (Fresnel), gợn B2-219 thấy được ở 5–20 m.
2. Không sáng hơn đất bờ × 2 (giữ tiêu chí B2-181c); chỉ đổi **sắc độ và độ tương phản trong mặt nước**, không làm phát sáng.
3. Bờ: dải chuyển ướt tối 0,3–0,8 m giữa nước và đất (bằng màu mép nước có sẵn), để không có cạnh cứng như lề đường.

### Test

- CPU: tại t = 0,02, sắc độ (chroma) của màu nước ≥ 0,04 và hue nằm giữa xanh lục–lam (G hoặc B lớn nhất); độ lệch chuẩn luma trong cửa sổ 4 × 4 m ≥ 0,015.
- Tiêu chí cũ của nước pass.
