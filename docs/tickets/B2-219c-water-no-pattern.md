## TICKET B2-219c: gợn nước không được có hoa văn lặp (vòng 3)

- Đọc `B2-219-water-surface.md`, `B2-219b-water-streaks.md`, `B2-229-dusk-sea-colour.md` (merge trước ticket này). Được sửa: `src/features/world/water/material.ts`, test nước.
- Ảnh trong game sau B2-219b: `docs/showcase/27-hoan-thien-1/lead-review/water-tread-pattern.webp`: mặt suối thành **hoa văn vảy/gai lốp lặp đều** (hàng chữ V nối tiếp). Còn tệ hơn sọc kẻ của B2-219.

### Việc

1. Bỏ mọi mẫu tuần hoàn dựa trên `fract`/`sin` của toạ độ dọc dòng tạo hàng lặp. Gợn = **noise giá trị/gradient 2D có domain warp**, kéo giãn theo hướng dòng (tỉ lệ 3:1), trôi chậm theo dòng.
2. Gợn nhìn như **vài vệt sáng mềm rời rạc**, không thành lưới/hàng. Biên độ nhỏ (vệt sáng hơn nền ≤ 12 %).
3. Giữ fade theo khoảng cách (B2-219b), bọt mép, phản chiếu, màu B2-221/B2-229.

### Test

- CPU: tự tương quan của trường gợn dọc theo dòng, ở mọi bước 0,5–8 m, ≤ 0,35 (không có chu kỳ lặp).
- Tỉ lệ diện tích vệt 4–12 % ở 10 m; ≤ 20 % biên độ ở 40 m. Test nước cũ pass.
