## TICKET B2-032 — Mẫu "ảnh film" ký ức + mẫu trang overlay tạp chí (HTML/CSS)

- Trạng thái: Assigned → Codex, đợt 15, nhánh `lane/B2-032`
- Đọc trước: `docs/tickets/_common-b2.md`
- Spec: §2 (overlay tạp chí ~85–90 % màn hình), §7.3 (tương phản AA, font đủ dấu tiếng Việt), §8 (JS ban đầu không tăng); taste brief §5.2, §5.5 (ký ức = ảnh film: viền, hạt, light leak nhẹ, ngày tháng cam ở góc; overlay: tiêu đề lớn, nhiều khoảng trắng, chữ ít)
- Việc: `src/components/portfolio/memory/` — **Server Component, 0 JS client**, chưa nối vào trang nào (Lead nối sau):
  1. `FilmFrame.tsx` + `film-frame.module.css`: props `{ children; date: string; caption?: string; variant?: "color" | "mono" }`. Viền film kem; hạt bằng CSS (SVG noise inline data-URI ≤ 1 KB); light leak rất nhẹ (radial gradient cam mờ ở một góc); ngày ở góc dưới phải màu `#D9822B`, kiểu số máy film (chuỗi do prop truyền vào, ví dụ `'26 11 04`). Lớp hạt/leak `aria-hidden`.
  2. `MagazinePage.tsx` + css: props `{ kicker; title; lead; children; art?: ReactNode }` — tiêu đề serif lớn (Noto Serif tự host sẵn), cột chữ hẹp, nhiều khoảng trắng, vùng minh họa tràn mép. Nền `#EEE8D8`, chữ `#2B2A26` (≥ 4.5:1). Hiển thị đúng trên màn nhỏ và khi zoom 200 %.
  3. Màu dùng CSS custom properties cùng giá trị `src/features/world/art/palette.ts` (copy giá trị, **không import** module world).
  4. Không animation (UI im lặng); không `"use client"`.
- Được sửa: `src/components/portfolio/memory/**`, `tests/unit/portfolio/memory.test.tsx` (renderToStaticMarkup từ `react-dom/server`)
- Test: FilmFrame render ngày + caption, lớp hạt aria-hidden; MagazinePage có đúng 1 `h2`; không `"use client"` trong thư mục; data-URI noise ≤ 1024 byte.
- Thêm vào điều kiện xong: `pnpm build` + `pnpm check:bundle` exit 0 (JS ban đầu không tăng).
