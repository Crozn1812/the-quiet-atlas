# Showcase đợt 27: hoàn thiện lượt 1 (từ "khung" tới bản gần xong)

> Ảnh tiến độ, **không phải** để chấm. Duy chỉ chấm khi UX/UI xong khoảng 90–100 % (T10 DEFERRED).

| # | Ảnh | Thấy gì |
|---|---|---|
| 1 | `01-rung-binh-minh.webp` | Rừng bình minh: tán lá viền lởm chởm (B2-213), mặt đất có biến màu và đốm nắng (B2-215) |
| 2 | `02-moc-dinh-huong.webp` | Đoạn từng "mù mốc" ở t = 0,38, nay có cột gỗ và chồng đá (B2-212) |
| 3 | `03-doi-co.webp` | Đồi có đồng cỏ túm lay gió quanh người chơi (B2-214) |
| 4 | `04-duong-ven-bien.webp` | Đường ven biển lúc hoàng hôn |
| 5 | `05-first-light.webp` | First Light |
| 6 | `06-workshop.webp` | Workshop: chái gỗ thấy rõ ván, không còn khối đen (B2-216 + Lead) |
| 7 | `07-quiet-shore.webp` | Quiet Shore |
| 8 | `08-last-postcard.webp` | Last Postcard |

## Công đoạn 5 (hành trình): đã đo

| Kiểm tra | Kết quả |
|---|---|
| Bot đi bộ thật trong trình duyệt (W + xoay camera, không chạy nhanh) | **PASS**: 6:08 (5:00–7:00), Workshop 47,7 s, Roots 66 s, Milestones 83 s, 0 lần kẹt. Bằng chứng: `docs/evidence/B2/journey-2026-11-06.md` |
| Đoạn "mù mốc" dài nhất (kiểm tự động) | 115 m → **60 m** sau B2-212 |
| Playtest người thật (không lạc) | **DEFERRED**: phiếu `docs/playtest/b2-journey.md`, làm khi UX/UI gần xong |

## Lead sửa sau khi xem render (Codex không thấy hình)

- B2-216 làm gỗ trong rừng thành **xanh lam nhạt/trắng**. Nguyên nhân: sàn sáng 0,08 cộng sương rừng, sắc lam 55 %, albedo vượt 1. Đã hạ sàn còn 0,03, sắc lam 20 %, giới hạn albedo.
- B2-214: lá cỏ đơn rộng 5 cm nhìn như đất trống. Đã đổi thành túm 4 lá, lưới 0,7 m, bán kính 18/12 m. Cỏ ẩn khi ở sâu trong rừng để giữ trần tam giác.

## Số đo

| Kiểm tra | Kết quả |
|---|---|
| Gate (lint, typecheck, unit) | **PASS**, 1562/1562 |
| e2e đầy đủ | **PASS**, 151/151 |
| Thời gian vào chơi (worst of 3) | **6,05–6,13 s**: trần spec 10 s **PASS**; mục tiêu nội bộ ≤ 6 s **chưa đạt** (trước đợt 27 là 5,90 s) → B2-217 |
| 3D bytes | **PASS**, 1,99 MB / 8 MB |

## Tiếp theo

- B2-217: kéo thời gian vào chơi về ≤ 6 s.
- Codex tài khoản hiện tại hết lượt tới **9/11 16:18**. Lead tự làm tiếp hoặc chờ Duy đổi tài khoản.
