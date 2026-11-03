## TICKET L1-004 — Sửa lỗi a11y T11, favicon, prefetch 404

- Trạng thái: **Draft** (chưa giao)
- Lane / milestone: L1 / A1
- Mục tiêu: T11 (axe) và T01 (0 lỗi console) đạt trên local.
- Spec liên quan: §9, §13 T01/T11, §7.3 (asset + giấy phép)
- Việc:
  1. Nút CV: `aria-label` phải chứa chữ hiển thị ("CV · TBD") hoặc bỏ `aria-label`, mô tả trạng thái bằng `aria-describedby` (axe `label-content-name-mismatch`).
  2. Link ngôn ngữ ở `/`: vùng bấm ≥ 24×24 px (WCAG 2.5.8, axe `target-size`).
  3. Favicon: SVG đơn giản tự vẽ (không dùng asset bên ngoài) + dòng trong `assets/LICENSES.csv` (Lead thêm dòng nếu file nằm trong `public/`).
  4. Next segment prefetch `/en/__next.$d$locale.__PAGE__.txt` 404: điều tra (build Linux có khác Windows không); nếu là lệch đường dẫn của static export thì tắt prefetch `next/link` ở trang tĩnh (`prefetch={false}`) hoặc dùng `<a>` thường cho link giữa trang.
  5. Sau khi sửa: xóa các mục tương ứng trong `tests/e2e/helpers.ts` `KNOWN_ISSUES` (Lead làm, vì `tests/e2e/` thuộc L3).
- Điều kiện xong: lint/typecheck/test/build/check:bundle exit 0; `pnpm test:e2e` exit 0 với `KNOWN_ISSUES.axeRules` rỗng và không còn `faviconMissing`.
