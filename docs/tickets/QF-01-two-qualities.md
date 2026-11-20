## TICKET QF-01 — Bỏ mức Balanced, chỉ còn Low và High

- **Lane / milestone:** L3 + L1 / playtest Duy 20/11 (ADR 0020 mục 3).
- **Mục tiêu:**
  - Menu Quality chỉ có hai nút, **Low** và **High**.
  - Người xem không bao giờ thấy hình kiểu Balanced, vì Duy báo mức này lỗi nhiều góc.
- **Spec liên quan:** ADR 0020, ADR 0007, ADR 0019.
- **Được sửa:**
  - `src/features/world/adaptive-quality.ts`
  - `src/components/portfolio/WorldMenu.ts`
  - `src/components/portfolio/worldMenuControls.ts`
  - các file trong `src/features/world/**` có nhánh "Balanced", tìm bằng: `grep -rn Balanced src`
  - test unit/e2e tương ứng trong `tests/`
  - `src/features/world/index.ts`, chỉ các dòng chọn quality
- **Không được sửa:** lockfile, `package.json`, `docs/`, `public/`.
- **Yêu cầu:**
  1. Kiểu quality chỉ còn `"Low" | "High"`.
  2. Mức mặc định giữ đúng logic probe hiện tại. Chỗ nào trước đây trả về Balanced thì đổi:
     - trả **High** nếu probe đạt mức của Balanced trở lên;
     - còn lại trả Low.
  3. Adaptive hạ chất lượng: High → Low.
  4. Mọi bảng hoặc cấu hình theo mức (ví dụ `GRASS_FIELD_RADII`) bỏ khóa `Balanced`. Không đổi giá trị của High và Low.
  5. Menu chỉ còn hai nút, giữ a11y (aria-pressed, focus) như hiện tại.
  6. Giá trị Balanced cũ có thể còn trong bộ nhớ phiên. Không đọc storage; nếu có state cũ thì chuẩn hoá về High.
- **Điều kiện xong:**
  - `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` exit 0.
  - `grep -rn Balanced src` không còn kết quả.
  - Chạy e2e menu/quality liên quan với cổng riêng, dán dòng tổng kết.
- **Bàn giao:** danh sách file, output các lệnh, chỗ nào đã đổi Balanced thành High hay Low.
