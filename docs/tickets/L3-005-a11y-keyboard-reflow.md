## TICKET L3-005 — T11 phần còn lại tự động hóa được: bàn phím, focus nhìn thấy, zoom/reflow, reduced motion; load budget bản VI

- Trạng thái: **Done — merged vào main** (2026-11-04)
- Lane / milestone: L3 / A1
- Mục tiêu: thu hẹp khoảng trống của T11 (§9) bằng phép thử tự động trên HTML; đo Q18 cho `/vi/`.
- Spec liên quan: §9 (WCAG 2.2 AA: heading, focus nhìn rõ, link/nút có tên, zoom 200 %, reflow, reduced motion), §13 T11, Q18
- Được sửa: `tests/e2e/` (thêm file mới; sửa `helpers.ts` nếu cần thêm helper), `tests/perf/`, `tools/load-budget/`, `tests/unit/tools/`, `docs/evidence/A1/` (file kết quả mới)
- Không được sửa: mọi thứ khác; đặc biệt `src/`, `package.json`, lockfile, config gốc ngoài phạm vi. Không `pnpm add/install`. Nếu phát hiện lỗi sản phẩm → ghi vào bàn giao, không sửa `src/`.
- Phép thử (Edge local, `tools/serve-out`):
  1. **Bàn phím**: trên `/en/`, `/vi/`, `/en/quick/`, một case study, privacy, 404 — chỉ dùng Tab/Shift+Tab/Enter: đến được mọi link/nút tương tác theo thứ tự hợp lý; không bẫy focus ngoài dialog; Enter trên link Quick/case study điều hướng đúng.
  2. **Focus nhìn thấy**: với mỗi phần tử nhận focus, có outline/box-shadow khác trạng thái không focus (so sánh computed style hoặc ảnh chụp vùng phần tử) — WCAG 2.4.7.
  3. **Heading**: mỗi trang đúng một `h1`, không nhảy cấp heading (h2 → h4).
  4. **Zoom 200 % / reflow**: viewport 320 CSS px (tương đương 1280 px ở 400 %) và 640 px (≈ 200 %): không có thanh cuộn ngang (`scrollWidth <= clientWidth + 1`) trên các trang trên; nội dung chính (tên, CV, liên hệ) vẫn hiển thị.
  5. **Reduced motion**: `emulateMedia({ reducedMotion: "reduce" })` — trang HTML không có animation/transition > 0 s trên phần tử hiển thị (hoặc ghi danh sách nếu có).
  6. **Q18 bản VI**: chạy load-budget trace cho `/vi/` và `/vi/quick/` (3 lần cold, xấu nhất), ghi kết quả.
- Điều kiện xong:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` exit 0; `pnpm test:e2e` exit 0 (phép thử phát hiện lỗi sản phẩm thì đánh dấu `test.fail()` kèm mô tả và báo Lead — không xóa phép thử)
  - `pnpm test:perf` exit 0 với VI
  - File kết quả `docs/evidence/A1/a11y-keyboard-2026-11-04.md`
  - Một commit trên nhánh
- Bàn giao: kết quả từng phép thử, lỗi sản phẩm phát hiện (file/selector), lệnh + exit code, phần T11 vẫn cần người thật (screen reader).
