## TICKET U-03: Welcome — nút chính nổi bật + ảnh nền mới

- **Đọc:** `_ux-common.md`, `_review-common.md` (cổng 4403), ADR 0009 (thẻ Welcome ở góc dưới trái; test L3-008).
- **Được sửa:**
  - `src/components/portfolio/Portfolio.tsx`, `WorldEntry.tsx`, `ForestBackdrop.tsx`;
  - `src/app/portfolio.css`;
  - `public/welcome/`, `assets/LICENSES.csv`;
  - `tools/review/` (script chụp hero);
  - test liên quan.
- **Hiện trạng** (`docs/showcase/30-do-hoa/hien-trang/ux-welcome.webp`):
  - nút "Enter World" chỉ là khung viền mảnh, cùng cấp với các liên kết khác;
  - ảnh nền là render cũ: đá khối, cột mốc to, mặt đường xám chiếm 1/3 khung.
- **Việc:**
  1. "Enter World" là hành động chính: nền đặc màu mực, chữ sáng, cao ≥ 48 px, có trạng thái hover/focus. Liên kết phụ (Quick, CV, email, âm thanh) nhỏ hơn và gom thành một hàng.
  2. Render lại ảnh hero từ build hiện tại (đã có texture đất, cây mới, AO): hoàng hôn ven biển, ít mặt đường, nhiều biển và trời.
     - Ảnh 1920 ≤ 60 KB, 960 ≤ 25 KB (webp);
     - giữ cách nạp hiện có (không chặn LCP);
     - Lighthouse PASS.
  3. Giữ ADR 0009 và mọi e2e Welcome.
- **Nghiệm thu:** ảnh trước/sau desktop và mobile; `pnpm perf:lhci`; `pnpm test:perf load-budget`.
