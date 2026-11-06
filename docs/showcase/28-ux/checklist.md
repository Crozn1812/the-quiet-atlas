# Showcase đợt 28: UX/UI hoàn thiện lượt 1

> Ảnh tiến độ, **không phải** để chấm (Duy chấm khi UX/UI ≈ 90–100 %). Ảnh trước khi sửa ở `hien-trang/`.

| # | Ảnh | Thay đổi |
|---|---|---|
| 1 | `01-welcome.webp` | Nền là khung render world: đường ven biển lúc hoàng hôn (thay cây vẽ phẳng kiểu cũ); thẻ bìa tạp chí neo góc dưới trái (ADR 0009) |
| 2 | `02-welcome-mobile.webp` | Mobile: mặt trời và biển ở nửa trên, thẻ full-width ở dưới |
| 3 | `03-overlay-first-light.webp` | Overlay tạp chí: một tiêu đề, kicker tên khu, minh hoạ màu nước SVG (suối chữ S), nút "× Đóng" gọn |
| 4 | `04-so-atlas.webp` | Sổ Atlas: số La Mã, dòng chủ đề, dấu mộc đỏ son khi đã ghé |
| 5 | `05-menu.webp` | Menu chia nhóm Hành trình / Cài đặt, chất lượng là 3 lựa chọn chữ, bật/tắt dạng chấm |
| 6 | `06-di-toi.webp` | "Đi tới…" cùng kiểu Sổ Atlas, khu đang ở ghi mờ |
| 7 | `07-quick.webp` | Quick Portfolio: dòng thời gian 2 cột, thẻ dự án 2 cột, đầu trang kicker |

## Số đo (commit `d4e8a16`)

| Kiểm tra | Kết quả |
|---|---|
| Gate (lint, typecheck, unit 1612) | **PASS** |
| e2e đầy đủ (gồm T01 Welcome, T02 HTML độc lập, T11 a11y/reflow, axe) | **PASS**, 151/151 |
| Lighthouse CI (3 URL × 5 lượt) | **PASS** |
| Welcome JS gzip | 135,0 KB / 150 KB **PASS** |
| Ảnh nền Welcome | 27 KB (desktop) / 10 KB (mobile), project-owned, có trong `assets/LICENSES.csv` |
