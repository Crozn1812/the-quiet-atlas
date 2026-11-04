## TICKET L3-010 — Chữ trong world theo ngôn ngữ (ADR 0008 mở rộng đợt 10)

- Trạng thái: **Assigned → Codex** (2026-11-04, đợt 10), nhánh `lane/L3-010`, worktree `D:/tqa-worktrees/L3-010`
- Lane / milestone: L3 World / B1 (§6.3, Q21)
- Ghi chú đánh số: từ đợt 10, lane L3 = World (trước đây world là "L2-00x").
- Mục tiêu: mọi chữ do world tự hiển thị (gợi ý "E — …", nhãn vật thể/placeholder chèn vào container, `aria-label` của canvas) theo `en`/`vi`; đổi tại chỗ khi nhận `tqa:set-locale`, không remount canvas, không đổi vị trí/secret/quality/pause.
- Hợp đồng (đã duyệt, xem `docs/adr/0008-ui-world-event-contract.md` mục "đợt 10"):
  - `WorldOptions.locale?: "en" | "vi"` (mặc định `"en"`).
  - Lắng nghe `tqa:set-locale` `{ locale }` trên container; gỡ listener khi unmount.
  - Ghi `data-world-locale` trên container (ban đầu và mỗi lần đổi).
- Từ điển chữ đặt trong `src/features/world/` (ví dụ `copy.ts`); **không** import `src/i18n/` hay `src/components/`. Bản tiếng Việt: dịch đúng nghĩa, giữ "(placeholder)" thành "(tạm)"; tên khu giữ như spec (The First Light, The Workshop…) nếu spec không có tên Việt — ghi rõ chỗ nào chưa chắc.
- Được sửa: `src/features/world/`, `src/features/interaction/`, `src/features/navigation/`, `src/state/`, `tests/unit/world/` (hoặc thư mục unit tương ứng hiện có)
- Không được sửa: `src/components/`, `src/app/`, `src/content/`, `tests/e2e/`, `tests/perf/`, `package.json`, lockfile, config, `docs/`. Không cài gói, không mạng.
- Ràng buộc: không tăng chunk world quá +2 KB gzip; không đổi tên event/attribute hiện có; không lưu ngôn ngữ vào storage.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` (unit cho từ điển + reducer/handler đổi locale), `pnpm build`, `pnpm check:bundle` exit 0 (dán output tóm tắt). Không chạy full e2e (L4). T08/T09 chạy lại: L4/Lead sau merge. Không commit.
- Bàn giao: thay đổi, chuỗi EN/VI, kích thước chunk world trước/sau, lệnh + exit code, selector/attribute cho L4.
