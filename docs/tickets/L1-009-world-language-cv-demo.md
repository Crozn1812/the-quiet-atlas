## TICKET L1-009 — Đổi ngôn ngữ trong world (§6.3, Q21) + nhãn "demo" trong CV + preview.ps1

- Trạng thái: **Assigned → Codex** (2026-11-04), nhánh `lane/L1-009`, worktree `D:/tqa-worktrees/L1-009`
- Lane / milestone: L1 / A1 + B1 (UI)
- Đọc trước: spec §6.3 (dòng "Đổi ngôn ngữ trong thế giới"), Q21 (§13); `docs/adr/0008-ui-world-event-contract.md`, `docs/adr/0009-full-viewport-shell-and-hud.md`.

### Phần A — Đổi ngôn ngữ trong world
- Mục tiêu: đang ở trong world `/en/`, mở Menu → chọn "Tiếng Việt" (và ngược lại). Ngay lập tức: nhãn HUD, menu, overlay nội dung (đang mở hay mở sau đó) chuyển sang ngôn ngữ mới; URL thành `/vi/` bằng `history.replaceState`; `document.documentElement.lang` và `document.title` đổi theo. **Canvas không remount** (cùng phần tử `canvas`), không gọi lại `mountWorld`, vị trí nhân vật và trạng thái world giữ nguyên.
- Cách làm gợi ý (Codex có thể chọn khác nếu nhẹ hơn, ghi lý do):
  - `WorldEntry` giữ `locale` trong state; HUD dùng copy theo locale hiện tại. Copy của ngôn ngữ kia: để trong chunk lazy (`WorldMenu`/`world-menu` i18n) — **không** đưa cả hai bộ từ điển vào JS ban đầu nếu vượt ngân sách.
  - Menu world có nhóm chọn ngôn ngữ (2 nút hoặc `<select>`, có nhãn), mục đang chọn có `aria-pressed`/`aria-current`.
  - Overlay: `loadWorldContent(newLocale)` (đã cache theo locale); overlay đang mở thì render lại nội dung ngôn ngữ mới, giữ focus trong dialog.
  - Thẻ Welcome (server-render theo locale gốc): khi bấm **Thoát world** sau khi đã đổi ngôn ngữ → điều hướng `location.assign("/<locale mới>/")` (lượt chơi kết thúc khi thoát world nên chấp nhận được); không đổi ngôn ngữ thì giữ hành vi cũ (focus về Enter World).
  - Thông báo cho screen reader một câu ngắn ("Language: Tiếng Việt") qua vùng `aria-live` sẵn có hoặc mới.
- Ngoài phạm vi: chữ placeholder do `src/features/world` tự chèn (nhãn "(placeholder)", gợi ý "E — …") — thuộc L2; ghi vào bàn giao nếu còn tiếng Anh.

### Phần B — CV: nhãn "demo"
- `tools/cv/render.mjs` (+ `content.mjs` nếu cần): dự án có evidence mức `Lab` hiện "· demo" cạnh link repo, giống web (`src/components/portfolio/ProjectLinkViews.tsx`). Không bịa thêm chữ.

### Phần C — `tools/cv/preview.ps1`
- Đường dẫn theo vị trí script (`$PSScriptRoot` → repo root), chạy được từ thư mục bất kỳ. Cập nhật `tools/cv/README.md` nếu nhắc tới.

### Chung
- Spec liên quan: §5, §6.3, §8, §13 Q21; ADR 0008, 0009
- Được sửa: `src/components/portfolio/`, `src/i18n/`, `src/app/` (chỉ nếu cần), `tools/cv/`, `tests/unit/`
- Không được sửa: `src/features/`, `src/state/`, `src/content/*`, `tests/e2e/`, `tests/perf/`, `public/`, `package.json`, lockfile, config gốc, `docs/`. Không `pnpm add/install`.
- Ràng buộc: JS ban đầu `/en/` hiện 140,4 KB gzip — **không vượt 141,5 KB**; không tải gì 3D trước Enter World; không lưu ngôn ngữ/tiến trình vào localStorage/sessionStorage/cookie; không đổi hợp đồng ADR 0008.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` (thêm unit cho logic đổi locale và nhãn demo CV), `pnpm build:artifacts`, `pnpm check:cv`, `pnpm check:bundle`, `pnpm check:leaks` exit 0. Không commit; Lead commit.
- Bàn giao: tóm tắt, JS ban đầu trước/sau, lệnh + exit code, selector/hành vi để L3 viết e2e Q21 (bỏ `test.skip` trong `tests/e2e/world-input.spec.ts`), việc chưa làm.
