## TICKET L4-010 — QA đợt 10: full suite, e2e ngôn ngữ world + font, timeout CI, T08/T09

- Trạng thái: **Assigned → subagent L4** (2026-11-04, đợt 10), nhánh `lane/L4-010`, worktree `D:/tqa-worktrees/L4-010`
- Lane / milestone: L4 QA / A1 + B1
- Đã merge trong đợt (main `7fd5d49`): L2-010 (điện thoại theo CV), L1-010 (Noto Serif tự host, UI gửi `tqa:set-locale`), L3-010 (chữ world theo ngôn ngữ, `data-world-locale`), L5-010 (CI Node 24, Chrome cho lhci).
- Spec: §6.3, §7.3, §8, §13 (T07, T08, T09, T11, Q18, Q21); ADR 0008 (mục đợt 10), ADR 0007

### Việc
1. **Timeout CI**: `tests/unit/world/contract.test.ts` — test "implements container pause/quality events…" bị timeout 5 s trên GitHub runner (run #1). Đặt timeout riêng cho test đó (ví dụ 30 s) — đây là giới hạn harness, không phải gate hiệu năng.
2. **e2e ngôn ngữ trong world** (mở rộng Q21 trong `tests/e2e/world-input.spec.ts`):
   - Enter World ở `/vi/` → `data-world-locale="vi"`, `canvas[aria-label]` tiếng Việt.
   - Ở `/en/` đổi sang vi qua menu → `data-world-locale` đổi, `canvas[aria-label]` đổi, cùng canvas; đi tới gợi ý (hoặc dùng cách sẵn có trong world-content spec) để thấy chữ gợi ý `E — Biển chỉ đường The First Light (tạm)`; nếu không đưa nhân vật tới được gợi ý một cách ổn định thì ghi NOT RUN phần gợi ý và lý do.
3. **Font** (T11/§7.3): trang `/vi/` dùng "Noto Serif" đã tải (`document.fonts.check('16px "Noto Serif"', 'Tiếng Việt')` và có request `/fonts/noto-serif-vietnamese-400-normal.woff2`), không request font ngoài domain; `/en/` không tải subset vietnamese 700 nếu trang không dùng.
4. **Ngân sách**: cập nhật kỳ vọng trong `tests/perf/` nếu cần cho font (tổng Welcome ≤ 1 MB, JS ≤ 150 KB) — **không nới ngưỡng**.
5. **Full suite một lần** (bạn là lane duy nhất chạy full): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:artifacts`, `pnpm test:e2e`, `pnpm test:perf`. Nếu fail ngẫu nhiên, chạy lại tối đa 1 lần và báo là flaky.
6. **T08/T09** chạy lại sau các thay đổi đợt 8–10 bằng harness hiện có (`playwright.frame.config.ts`, headed, máy dev ADR 0007). Ghi kết quả vào `docs/evidence/B1/` là vùng Lead → **không ghi docs**; dán số liệu vào bàn giao, Lead ghi.
- Được sửa: `tests/`, playwright config
- Không được sửa: `src/`, `tools/` (trừ không), `package.json`, lockfile, `docs/`, `.github/`. Lỗi sản phẩm → `test.fail()` + báo Lead.
- Điều kiện xong: các lệnh ở mục 5 exit 0 (dán dòng tổng kết), T08/T09 có số liệu hoặc ghi NOT RUN/BLOCKED kèm lý do. Không commit.
