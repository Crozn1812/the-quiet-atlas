## TICKET L3-008 — Cập nhật e2e/perf theo shell toàn màn hình + HUD (ADR 0009)

- Trạng thái: **Done — merged vào main** `48ac1a5` (2026-11-04)
- Lane / milestone: L3 / A1 + B1
- Đọc trước: `docs/adr/0009-full-viewport-shell-and-hud.md`, `docs/adr/0008-ui-world-event-contract.md`, `src/components/portfolio/{Portfolio.tsx,WorldEntry.tsx,WorldMenu.ts}` (đã merge ở `f54407e`).
- Mục tiêu: toàn bộ e2e/perf phản ánh bố cục mới, không nới lỏng phép thử.
- Thay đổi bố cục cần theo:
  - Nút mở menu world: `.world-hud button[aria-haspopup='dialog']` (trước là `.world-menu > button[aria-haspopup='dialog']`).
  - "Back to Welcome" bỏ; thay bằng "Exit world"/"Thoát world" trong HUD và trong menu.
  - Skip link trên Welcome trỏ tới thẻ `#content`.
  - Welcome chỉ còn thẻ góc: tên, vai trò, câu giới thiệu, Enter World, Quick Portfolio, CV, email, Sound. Khối dự án/CV/liên hệ chi tiết đã chuyển sang Quick.
  - Container world `position: fixed; inset: 0`; canvas phủ toàn viewport.
- Spec bị ảnh hưởng (theo bàn giao L1-008): `helpers.ts`, `world-menu`, `world-input`, `world-content`, `q15-context-loss`, `world.spec`, `a11y-keyboard` (số lần Tab), T01, có thể `tests/perf/*`.
- Phép thử thêm:
  1. Welcome 1366×800: không thanh cuộn dọc (`scrollHeight <= innerHeight`), thẻ góc nằm trong viewport, ở nửa trái-dưới.
  2. Sau Enter World: canvas bounding box = viewport (x=0, y=0, w/h = viewport), HUD có 6 nút có tên truy cập, mỗi nút ≥ 24×24.
  3. Thoát world (nút HUD): không còn canvas, thẻ đầy đủ hiện lại, focus ở Enter World.
  4. axe trên Welcome và trong world: 0 vi phạm (giữ KNOWN_ISSUES rỗng).
- Được sửa: `tests/e2e/`, `tests/perf/`.
- Không được sửa: mọi thứ khác (`src/`, `package.json`, lockfile, config, `docs/`). Lỗi sản phẩm → `test.fail()` + báo Lead.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build:artifacts`, `pnpm test:e2e`, `pnpm test:perf` exit 0. Không commit; Lead commit.
- Bàn giao: danh sách thay đổi, kết quả từng phép thử, lệnh + exit code, lỗi sản phẩm phát hiện.
