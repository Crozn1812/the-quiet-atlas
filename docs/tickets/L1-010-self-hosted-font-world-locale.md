## TICKET L1-010 — Font tự host có dấu tiếng Việt + gửi ngôn ngữ cho world

- Trạng thái: **Assigned → Codex** (2026-11-04, đợt 10), nhánh `lane/L1-010`, worktree `D:/tqa-worktrees/L1-010`
- Lane / milestone: L1 Portfolio UI / A1 (+ B1 phần UI)
- Spec: §4.6 (asset/giấy phép), §7.3 (font đủ glyph tiếng Việt), §8 (ngân sách tải), §6.3 (đổi ngôn ngữ trong world); ADR 0008 (mở rộng đợt 10), ADR 0009

### A. Font
- Mục tiêu: mọi trang dùng **Noto Serif** tự host (giấy phép OFL-1.1, Duy đồng ý 2026-11-04), dấu tiếng Việt hiển thị đúng trên máy không cài font.
- Nguồn: `node_modules/@fontsource/noto-serif/files/` (Lead đã cài 5.3.0). Sao chép **chỉ** các file cần: `noto-serif-{latin,vietnamese}-{400,700}-normal.woff2` (+ `400-italic` nếu giao diện đang dùng italic — kiểm trước, không dùng thì bỏ) vào `public/fonts/`.
- `@font-face` trong `src/app/portfolio.css` với `unicode-range` đúng từng subset (lấy từ CSS của gói), `font-display: swap`; stack: `"Noto Serif", "Times New Roman", serif`.
- Preload: chỉ 1 file (latin 400) bằng `<link rel="preload" as="font" type="font/woff2" crossorigin>` trong layout `[locale]`; không preload subset khác.
- Giấy phép: thêm dòng cho **từng file** vào `assets/LICENSES.csv` (đúng cột hiện có); thêm `public/fonts/OFL.txt` copy từ `node_modules/@fontsource/noto-serif/LICENSE`.
- Ngân sách: tổng font tải ở Welcome ≤ 60 KB; JS ban đầu `/en/` không đổi (hiện 140,6 KB gzip, trần ticket 141,5 KB); Welcome tổng ≤ 1 MB.

### B. Gửi ngôn ngữ cho world (hợp đồng ADR 0008 mở rộng đợt 10 — đã duyệt)
- `WorldEntry.tsx`: gọi `mountWorld(container, { collision: "rapier", locale })` với locale hiện tại.
- `WorldMenu.ts`: khi đổi ngôn ngữ, dispatch `new CustomEvent("tqa:set-locale", { detail: { locale: next } })` trên container (sau `replaceWorldLocale`).
- Không sửa `src/features/` (L3 làm phía world song song). Kiểu `locale` trong option: truyền qua đối tượng; nếu typecheck báo `WorldOptions` chưa có `locale` thì dùng ép kiểu tối thiểu có comment `// ADR 0008 đợt 10 — L3-010 thêm locale vào WorldOptions` — Lead gỡ khi merge.

### Chung
- Được sửa: `src/app/`, `src/components/portfolio/`, `public/fonts/`, `assets/LICENSES.csv`, `tests/unit/portfolio/`
- Không được sửa: `src/features/`, `src/state/`, `src/content/`, `tools/`, `tests/e2e/`, `tests/perf/`, `package.json`, lockfile, config gốc, `docs/`. Không `pnpm add/install`, không tải mạng.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle`, `pnpm check:licenses`, `pnpm check:leaks` exit 0 (dán output tóm tắt). Báo: kích thước từng file font, font thực tải ở `/en/` và `/vi/`, JS ban đầu trước/sau. Không chạy full e2e (L4 làm). Không commit.
