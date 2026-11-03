## TICKET L1-004 — Sửa lỗi a11y T11, favicon, prefetch 404

- Trạng thái: **Assigned → Codex** (2026-11-04), nhánh `lane/L1-004`, worktree `D:/tqa-worktrees/L1-004`
- Lane / milestone: L1 / A1
- Mục tiêu (theo trải nghiệm người dùng): trang không có lỗi console; nút và link đọc đúng tên bằng screen reader; link ngôn ngữ dễ bấm trên màn hình cảm ứng.
- Spec liên quan: §7.3 (asset + giấy phép), §9, §13 T01/T11
- Được sửa: `src/app/`, `src/components/portfolio/`, `src/i18n/`, `tests/unit/portfolio/`, `tests/unit/i18n/`, `public/` (chỉ file favicon), `assets/LICENSES.csv` (chỉ thêm đúng 1 dòng cho favicon)
- Không được sửa: mọi thứ khác; đặc biệt `src/content/index.ts`, `src/content/evidence.json`, `src/features/`, `src/state/`, `tests/e2e/` (Lead cập nhật `KNOWN_ISSUES` sau), `package.json`, lockfile, config gốc, `docs/`, `tools/`. Không `pnpm add/install`.
- Việc:
  1. Nút CV ở Welcome/Quick: tên truy cập phải chứa chữ hiển thị ("CV · TBD"). Bỏ `aria-label`, mô tả trạng thái "chưa có" bằng `aria-describedby` (axe `label-content-name-mismatch`).
  2. Link ngôn ngữ ở `/` (và nav ngôn ngữ các trang khác nếu cùng kiểu): vùng bấm ≥ 24×24 px CSS (WCAG 2.5.8, axe `target-size`). Sửa bằng CSS trong `src/app/portfolio.css`.
  3. Favicon: tự vẽ SVG đơn giản (ví dụ chữ "QA" hoặc hình la bàn tối giản bằng `<path>`; **không** lấy icon/asset bên ngoài, không dùng font ngoài), đặt `public/favicon.svg` và khai báo qua metadata `icons` của Next. Thêm dòng `assets/LICENSES.csv`: `public/favicon.svg`, người tạo "Codex for Nguyễn Hữu Bảo Duy (project-original)", license "Project-owned", sửa: yes, phân phối web: yes, repo: yes, attribution: none, proof: "Generated in-repo, ticket L1-004", các cột kỹ thuật `-`. Trình duyệt vẫn tự gọi `/favicon.ico` → thêm `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` là đủ cho Chromium; nếu vẫn còn request `/favicon.ico` 404 thì ghi rõ trong bàn giao (không tạo file .ico nhị phân).
  4. Next segment prefetch: trang `/` và 404 có request `/en/__next.$d$locale.__PAGE__.txt` trả 404 (output ghi file ở `out/en/__next.$d$locale/__PAGE__.txt`). Cách sửa ưu tiên: link giữa các trang tĩnh dùng `prefetch={false}` hoặc `<a>` thường (trang đã là HTML tĩnh, không cần prefetch RSC). Kiểm `out/` không còn HTML nào kích hoạt prefetch đó (tìm cách xác minh bằng mã: không còn `next/link` ở các trang này, hoặc mọi `Link` có `prefetch={false}`).
- Ràng buộc: không bịa nội dung; ngân sách JS (~139/150 KB gzip) không tăng quá 2 KB; không import `features/world`.
- Điều kiện xong (Codex chạy): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle`, `pnpm check:leaks`, `pnpm check:licenses` exit 0. Có thể chạy `pnpm test:e2e` (Edge local) — kỳ vọng a11y test **fail** với thông điệp "every KNOWN_ISSUES … must still reproduce" (nghĩa là đã sửa xong), đó là đúng; ghi lại output.
- Không commit (sandbox chặn); Lead commit.
- Bàn giao: tóm tắt, lệnh + exit code, việc chưa làm.
