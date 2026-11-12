# Showcase 36 — R2, phần Antigravity làm (đêm 12 → 13/11/2026)

Lead (Claude) điều khiển Antigravity bằng computer use, tự build, chụp ảnh High trên máy dev (RTX 3060, Edge) và duyệt trước khi merge. Chưa push. T08/T09 Iris Xe: NOT RUN. Đây là ảnh duyệt của Lead, **không** phải phiếu chấm T10 của Duy.

## Đã merge vào main

| Ticket (góp ý của Duy) | Commit | Ảnh | Duy chấm |
|---|---|---|---|
| **SC-01** (#6) bí mật to hơn, mơ hồ, nhìn thấy được | `4d76f65` | [gương vòm](sc01-mirror-arch.webp) · [chuông gió](sc01-wind-chime.webp) · [lối mòn](sc01-faint-trail.webp) · [băng ghế, cảnh kết](sc01-bench-ending.webp) | giữ / sửa / bỏ |
| **WS-02** (#11) cổng đình làng có lửa thay "cửa chuồng heo" | `9cbbb86` | [cận](ws02-gate-close.webp) · [từ đường mòn](ws02-gate-wide.webp) | giữ / sửa / bỏ |
| **HZ-02** (#12) bấm E ngồi ghế ngắm cảnh ở Horizon | `cebecd7` (đánh dấu `dd1aaf2`) | [đang ngồi](hz02-sit.webp) · [đứng cạnh ghế](hz02-near-bench.webp) | giữ / sửa / bỏ |
| **B2-091** tiếng chuông gió gần bí mật Forgotten Sound (Lead mở thêm) | `7367882` | không có ảnh; bật Sound rồi đi lại gần chuông gió | giữ / sửa / bỏ |

Ghi chú ảnh:
- Ảnh WS-02 chụp trước khi RT-02 (`bb911ea`) chuyển bảng kỹ năng sang Roots; trên main hiện tại cạnh cổng không còn bảng.
- Các chấm đen lấm tấm quanh tán cây trong ảnh gương vòm và chuông gió là hiệu ứng làm mờ tán khi camera lùi xa, có từ trước, không thuộc SC-01.

## Kiểm tra đã chạy (máy dev, không phải Iris Xe)

| Ticket | Kết quả |
|---|---|
| SC-01 | gate merge PASS: lint, typecheck, unit 1737/1737; build exit 0 |
| B2-091 | gate merge PASS (lint, typecheck, toàn bộ unit); unit audio 24/24. Nghe thử trong trình duyệt: **NOT RUN** |
| WS-02 | gate merge PASS (lint, typecheck, toàn bộ unit); unit Workshop 27/27; build exit 0 |
| HZ-02 | gate PASS trên cây đã gộp; e2e `world-horizon-bench` + `world-railing` **4/4 PASS** (VI/EN); build exit 0 |

Full e2e, load-budget, Lighthouse, CPU so main cho cả đợt R2: **NOT RUN** (chạy một lần khi mọi ticket R2 đã merge).

## Chưa xong

- **MS-02** (#9) tượng đá Duy đang ghép: vòng 1 quá nhỏ và tối, vòng 2 to và đọc được chữ nhưng là chồng hộp trắng. Vòng 3 đang dựng theo công thức hình khối của Lead (đầu, tóc, kính, cổ, vai, phần thiếu, hốc chứng chỉ). Chưa merge.
- Việc theo dõi: sau khi đổi chất lượng ngay lúc vừa dịch chuyển, khi máy tải nặng, địa hình có thể chưa dựng xong lúc chụp ảnh e2e (thấy ở HZ-02). Chưa xác định là lỗi sản phẩm hay do tải.

## Quy trình và quota

- Antigravity: `Gemini 4 Argon` hết lượt tuần 22:33 ngày 12/11 (hồi 19/11). Lead thử Claude Opus 5.5 trong Antigravity: hết khung 5 giờ và còn 16 % lượt tuần của nhóm "Claude and GPT" sau vài phút. Từ 23:05 chạy `Gemini 3.8 Flash`. Không bật trả thêm tiền. Chi tiết: `docs/runbook/antigravity.md`.
- Phiên Lead này dừng 23:07 → 02:11 vì hết khung 5 giờ của Claude.
- Sandbox Antigravity chặn `pnpm build` ở một số ticket, nên Lead build và chụp ảnh.
