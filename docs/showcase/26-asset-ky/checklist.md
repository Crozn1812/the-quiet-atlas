# Showcase đợt 26: asset làm kỹ (B2 công đoạn 1–4)

- Ảnh chụp bằng trang tour (`tools/styleframes/tour.html`), dùng đúng bộ ghép world thật, tầm nhìn High.
- `12-t10-12-anh.webp` là **bộ 12 ảnh T10**: 3 hàng là rừng (t = 0,06), đồi (0,55), đường ven biển (0,86); 4 cột là nhìn theo hướng đi, bên phải, quay lại, bên trái. Ảnh gốc từng tấm: chạy `node tools/styleframes/t10.mjs <thư mục>`.
- Duy chấm từng dòng: **giữ / sửa / bỏ**, ghi chú nếu sửa.

| # | Ảnh | Thấy gì | Giữ / Sửa / Bỏ | Ghi chú |
|---|---|---|---|---|
| 1 | `01-rung-binh-minh.webp` | Rừng bình minh: cây lá rộng tán tròn có cành, thân nâu, cỏ và dương xỉ, sương sớm | | |
| 2 | `02-doi-giua.webp` | Đồi giữa: trời trong, cỏ xanh vàng, thông | | |
| 3 | `03-duong-ven-bien.webp` | Đường ven biển lúc hoàng hôn | | |
| 4 | `04-first-light.webp` | First Light (điểm xuất phát) | | |
| 5 | `05-workshop.webp` | Workshop: chái gỗ cạnh suối | | |
| 6 | `06-roots.webp` | Roots: gốc cổ thụ, rễ nổi | | |
| 7 | `07-milestones.webp` | Milestones: cụm đá trên đồi | | |
| 8 | `08-old-trail.webp` | Old Trail: cột mốc gỗ, hàng rào đổ | | |
| 9 | `09-horizon.webp` | Horizon: tuabin, ghế ngắm biển | | |
| 10 | `10-quiet-shore.webp` | Quiet Shore: hiên gỗ, hàng rào hoa, piano, chó, xe | | |
| 11 | `11-last-postcard.webp` | Last Postcard: hộp thư, giá bưu thiếp | | |
| 12 | `12-t10-12-anh.webp` | 12 ảnh T10 (xem trên) | | |
| 13 | `13-nhan-vat.webp` | Nhân vật Duy làm kỹ: tóc lọn, kính, nẹp áo, tay xắn, gấu quần, dây giày, túi tote | | |

## Đợt này đã làm

- **Ánh sáng (công đoạn 1):**
  - Nước nhận màu bình minh/hoàng hôn, có phản chiếu trời theo góc nhìn (B2-181).
  - Mây không còn thành hàng lặp (B2-188, B2-188b).
  - Lá ngược nắng không còn đen.
- **Art bible khoá (công đoạn 3):** `docs/art-bible/` có palette, ánh sáng, shading, ngân sách asset, chất liệu, nhân vật, GD110 (B2-184). Mọi con số trỏ về file nguồn.
- **Asset (công đoạn 2):**
  - Bộ đá dùng chung (B2-186), bộ đồ gỗ (B2-187).
  - Cỏ dày, dương xỉ răng cưa, hoa dại (B2-185); mặt đất có lối mòn, rêu, đất ẩm (B2-190).
  - GD110 chi tiết (B2-189), nhân vật chi tiết (B2-192). Thông v2 (B2-191) đã viết nhưng chưa nối.
  - Bờ biển bỏ lớp cát ô vuông (B2-193).
  - 8 khu vòng 4 dùng bộ đá/gỗ (B2-201…208).
- **Lead kiểm bằng ảnh render** (Codex không có trình duyệt nên không thấy):
  - Tán cây là 3 cột cụm lá nên trông như vòm rỗng → đổi thành tán vòm 14 cụm, mỗi cụm có cành.
  - Thân cây màu kem do shader ép sáng → giờ nâu xám.
  - Lá trong bóng màu navy/đen → giờ xanh lá.
  - Milestones dựng mất 1,47 s → 0,42 s.
- **Cảnh chuẩn T10 (công đoạn 4):** có bộ chụp 12 ảnh và phiếu chấm (B2-209).

## Vòng sửa thứ hai (2026-11-06 sáng): đã xong

| Ticket | Việc | Kết quả |
|---|---|---|
| B2-181c | Suối ven biển là dải đen | Phản chiếu trời chiều, không còn đen |
| B2-188c | Mây như bỏng ngô | Ít đám, đám to, nhiều trời trống |
| B2-195 | Rãnh suối ở đồi; đất trồi qua đường nhựa | Bờ thoải; hết mảng loang cạnh đường |
| B2-196 | Cây vòm lối quá to, nghiêng | Thân đứng, cách lối |
| B2-194, B2-191b | Thông v2 | Đã nối; tầng chùm kim đọc rõ (trước là que tăm) |
| B2-197 | Thời gian vào chơi 6,18 s | 5,90 s (dựng 5 khu xa sau khung hình đầu) |
| B2-204b, B2-208b | Đá Milestones như con ốc; đá Last Postcard như lốp xe | Phiến/tảng đá tự nhiên có mặt vỡ |
| Lead | Vạch ngang như dây điện trên tán rừng (do kéo dãn cành của cây vòm) | Giới hạn độ vươn 3 m; hết vạch |

## Còn lại

- **B2-198:** tán cây vòm chưa khép trên tâm lối (cần cành lớn thật vươn ra lối). Codex hết lượt tới 13:28; giao lại khi hồi.

## T10: phiếu chấm

- 12 ảnh riêng: thư mục `t10/`. Phiếu chấm: `t10/phieu-cham-t10.md`.
- Duy và **một người ngoài** chấm độc lập. Đạt khi ≥ 10/12 ảnh được cả hai chấm đạt.

## Số đo

| Kiểm tra | Kết quả |
|---|---|
| Gate (lint 0 warning, typecheck, unit) | **PASS**, 1543/1543 |
| e2e đầy đủ | **PASS**, 151/151 (lần đầu 2 test intro timeout khi chạy song song; đã nâng timeout riêng spec đó, lần chạy lại 151/151) |
| 3D bytes tới lúc chơi được | **PASS**, 1,99 MB / 8 MB |
| Thời gian vào chơi (lần xấu nhất / 3) | **5,90 s**: trần spec 10 s **PASS**; mục tiêu nội bộ ≤ 6 s **PASS** |
| Nhân vật | 7 784 tam giác, 147 KB (trần 12 000 / 600 KB) **PASS** |
| T10 (Duy + 1 người ngoài chấm ≥ 10/12) | **NOT RUN**: cần Duy và 1 người ngoài |
| T08/T09 FPS trên laptop Iris Xe | **NOT RUN**: Duy đo trên laptop (ADR 0007) |
