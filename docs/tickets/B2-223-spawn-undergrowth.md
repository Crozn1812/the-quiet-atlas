## TICKET B2-223: thảm thực vật dày quanh điểm xuất phát và dọc lối rừng

- Đọc `_finish-common.md`, `B2-185-ground-cover.md`, `B2-214-grass-field.md`.
- Được sửa: `src/features/world/foliage/ground.ts` (mật độ/loại theo khoảng cách tới lối và spawn), `src/features/world/foliage/grass-field.ts` (thêm biến thể rừng), test liên quan.
- Ảnh **trong game thật** (camera góc ba phần tư sau nhân vật): `docs/showcase/27-hoan-thien-1/lead-review/ingame-spawn.webp`. Camera nhìn xuống nên **mặt đất chiếm ~70 % khung hình** và đang là mảng xanh tối trống.

### Việc

1. Trong 30 m quanh spawn và trong 6 m hai bên lối rừng (t < 0,24): mật độ lớp phủ nền gấp 2–3 lần hiện tại: dương xỉ thành đám, túm cỏ rừng thấp, lá khô, cành khô nhỏ, vài đốm hoa trắng; thưa dần ra xa.
2. Đồng cỏ quanh người chơi (B2-214) thêm biến thể **rừng**: túm thấp 0,15–0,35 m, màu `forestDeep` → `grass`, chỉ ở ngoài lối và ngoài nền khu; bán kính như cũ.
3. Giữ ngân sách: tổng tam giác High không quá +25 % so với trước ticket; thời gian vào chơi không tăng (phần ngoài vòng spawn vẫn dựng sau khung đầu như B2-217).

### Test

- Ô 10 × 10 m sát lối ở t = 0,02 và 0,15: ≥ 2 lần số vật phủ hiện tại (đếm trước/sau trong test).
- Không vật nào trên lối/nước/nền khu; ngân sách tam giác.
