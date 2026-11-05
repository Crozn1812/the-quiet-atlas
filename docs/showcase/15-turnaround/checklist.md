# Showcase đợt 15 — Phác thảo nhân vật + xe GD110 (ADR 0013 mục 4c)

Ảnh render từ Blender 5.2.3 (Cycles, nền giấy `#EEE8D8`), mô hình dựng hoàn toàn bằng script trong repo (`tools/assets/blender/character.py`, `gd110.py`) — không dùng pixel nào của ảnh tham chiếu. Đây là **phác thảo khối/tỷ lệ/màu**, chưa phải mô hình cuối: chưa có rig, chưa có shader tranh của world.

Duy chấm từng dòng: **giữ / sửa / bỏ** (ghi chú nếu sửa).

## Nhân vật — `character-front.webp`, `character-three-quarter.webp`, `character-back.webp`

| # | Hạng mục | Hiện tại | Giữ / Sửa / Bỏ | Ghi chú |
|---|---|---|---|---|
| 1 | Tỷ lệ cơ thể | Người thật mảnh, ~7 đầu, cao 1,72 m, không chibi | Giữ | Duy, 2026-11-05 (D-23) |
| 2 | Tóc | Đen, ngắn, mái rủ xuống trán hơi lệch | Giữ | Duy, 2026-11-05 (D-23) |
| 3 | Kính | Tròn, gọng kim loại mảnh vàng nhạt | Giữ | Duy, 2026-11-05 (D-23) |
| 4 | Mặt | Cách điệu, mũi gợi khối, nụ cười rất nhẹ, không chân dung | Giữ | Duy, 2026-11-05 (D-23) |
| 5 | Áo | Sơ mi trắng kem rộng, xắn tay tới khuỷu, trơn không logo | Giữ | Duy, 2026-11-05 (D-23) |
| 6 | Quần, tất, giày | Short đen, tất trắng, giày vải xanh lá đế trắng | Giữ | Duy, 2026-11-05 (D-23) |
| 7 | Tote | Túi vải kem đeo vai | Giữ | Duy, 2026-11-05 (D-23) |
| 8 | Màu da | Ấm vừa | Giữ | Duy, 2026-11-05 (D-23) |
| 9 | Mức cách điệu nói chung | Low-poly khối vát (sẽ phủ shader tranh trong world) | Giữ | Duy, 2026-11-05 (D-23) |

## Xe GD110 — `gd110-left.webp`, `gd110-front-three-quarter.webp`, `gd110-rear.webp`

| # | Hạng mục | Hiện tại | Giữ / Sửa / Bỏ | Ghi chú |
|---|---|---|---|---|
| 10 | Dáng tổng thể | Côn tay cổ điển nhỏ, thân trắng, yên đen dài | Giữ | Duy, 2026-11-05 (D-23) |
| 11 | Ghi đông | **Scrambler** vuốt cao, có thanh giằng (Q-25) | Giữ | Duy, 2026-11-05 (D-23) |
| 12 | Vành, lốp | Vành nan, lốp đen | Giữ | Duy, 2026-11-05 (D-23) |
| 13 | Gương, đèn | Gương tròn hai bên, đèn pha tròn | Giữ | Duy, 2026-11-05 (D-23) |
| 14 | Baga sau | Có | Giữ | Duy, 2026-11-05 (D-23) |
| 15 | Phụ kiện | Mũ bảo hiểm half-face + kính phi công tròng hổ phách mờ; tote treo ghi đông | Giữ | Duy, 2026-11-05 (D-23) |
| 16 | Ống xả | Kim loại mờ, ấm (không chrome bóng) | Giữ | Duy, 2026-11-05 (D-23) |
| 17 | Không huy hiệu / chữ | Không chữ Suzuki, không logo, không biển số chữ | Giữ | Duy, 2026-11-05 (D-23) |

Số liệu: nhân vật 6 884 tam giác / 484 KB (ngân sách 12 000 / 600 KB); xe 4 600 tam giác / 306 KB (ngân sách 8 000 / 400 KB). Chưa nén meshopt.

## Chưa có trong đợt này

- **Style frame A / B / C** (rừng bình minh + biển hoàng hôn): bàn dựng đã chạy (`tools/styleframes`), nhưng Lead chưa hài lòng về màu (sương còn bạc, biển xám) — chưa gửi Duy chọn. Sẽ gửi ở đợt sau kèm video 15–20 s và FPS Iris Xe.
