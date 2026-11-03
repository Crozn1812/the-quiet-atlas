## TICKET L1-007 — CV PDF hai ngôn ngữ + ảnh Open Graph sinh lúc build

- Trạng thái: **Assigned → Codex** (đợt 7, 2026-11-04), nhánh `lane/L1-007`, worktree `D:/tqa-worktrees/L1-007`
- Lane / milestone: L1 / A1
- Mục tiêu: `/cv/` có link tới CV PDF EN và VI sinh từ `src/content` public, tên file có ngày phiên bản; mỗi trang có ảnh Open Graph riêng (Welcome/Quick/case study) để chia sẻ LinkedIn/Zalo/Slack.
- Spec liên quan: §4.4 (CV từ content public, hai ngôn ngữ, tên file có ngày, xóa metadata), §4.7 (OG sinh lúc build), §5 (route `/cv/`)
- Được sửa: `tools/cv/`, `tools/og/` (mới), `src/app/` (route `/cv/`, metadata `openGraph.images`), `src/components/portfolio/`, `src/i18n/`, `tests/unit/` (thư mục con mới `tools-cv/`, `tools-og/`)
- Không được sửa: `src/content/index.ts`, `evidence.json`, `drafts.ts`, `src/features/`, `src/state/`, `tests/e2e/`, `tests/perf/`, `package.json`, lockfile, config gốc, `docs/`, `public/`. Không `pnpm add/install`. Script cần thêm vào `package.json` → bàn giao (Lead thêm).
- Ràng buộc:
  - **Không thêm dependency.** Render bằng Playwright đã có (`@playwright/test` → `chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" })`): trang HTML tạm sinh từ content → `page.pdf()` (CV) và `page.screenshot()` 1200×630 (OG). Không tải browser.
  - Sinh **sau `next build`** vào `out/cv/` và `out/og/` (không vào `public/`, để không cần dòng `LICENSES.csv` cho file sinh). Metadata trỏ đường dẫn tương đối theo `SITE_URL`.
  - CV dùng đúng dữ liệu public; trường `TBD` hiện "TBD" và trang CV có nhãn "Draft" khi `reviewStatus` ≠ approved. **Không** đọc `drafts.ts`. Số điện thoại: chỉ hiện nếu khác TBD.
  - Tên file: `cv-nguyen-huu-bao-duy-<locale>-<YYYY-MM-DD>.pdf`. Xóa metadata: không Author/Creator/Producer chứa tên máy/đường dẫn; đặt Title cố định.
  - Font: dùng font hệ thống có đủ dấu tiếng Việt (ví dụ Segoe UI/Arial); kiểm chữ "Nguyễn Hữu Bảo Duy" hiển thị đúng trong PDF (trích text từ PDF bằng script Node thuần, hoặc chụp ảnh kiểm).
  - Q15 phía UI: `WorldEntry` nghe `tqa:world-error` (ADR 0008, L2-007 thêm cùng đợt) trên container → gỡ world, chuyển `recoverableError`, hiện thông báo + link Quick Portfolio trong ≤ 2 s; unit test bằng `EventTarget` giả.
  - Trang `/cv/` có link tải hai bản + ghi chú bản nháp; Welcome/Quick: nút CV trỏ tới `/cv/` (thay "CV · TBD" disabled) — chỉ khi file sinh thành công.
- Điều kiện xong: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, chạy tool CV + OG (lệnh trong bàn giao) exit 0; `out/cv/*.pdf` (2 file), `out/og/*.png` tồn tại; `pnpm check:bundle`, `pnpm check:leaks` exit 0 sau khi sinh. Không commit; Lead commit.
- Bàn giao: lệnh chạy, kích thước file, cách kiểm dấu tiếng Việt, metadata PDF, script đề xuất, việc chưa làm.
