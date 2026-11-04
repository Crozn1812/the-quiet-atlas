## TICKET B2-014 — Atlas Journal: mô hình trạng thái (chỉ trong memory)

- Trạng thái: Assigned → Codex, đợt 15, nhánh `lane/B2-014`
- Đọc trước: `docs/tickets/_common-b2.md`
- Spec: §7.2 (Atlas Journal), §1.2 + §6.2 (không lưu tiến trình), §7.5 (secrets dùng Set ID); taste brief §5.8 (Atlas Journal đóng dấu mộc)
- Việc: `src/features/journal/model.ts` (thư mục mới) — reducer thuần, không DOM, không React:
  - State: `visited: ReadonlySet<ZoneId>`, `secrets: ReadonlySet<SecretId>`, `open: boolean`. `SecretId = "reflection" | "forgotten-sound" | "unmarked-road" | "unwritten-page"`.
  - Action: `open`, `close`, `toggle` (phím J), `visit(zoneId)`, `findSecret(id)`, `reset` (khi rời world).
  - `journalEntries(state, locale)`: 8 dòng theo thứ tự `ZONE_IDS` (import từ `src/features/interaction/targets.ts`), mỗi dòng `{ zoneId, title, stamped }`; **không tọa độ/vị trí** (không phải minimap).
  - `blankPages(state)`: 0 khi chưa có secret; sau secret đầu = số secret chưa tìm trong 3 secret đầu (trang trắng gợi ý), không lộ tên secret.
  - `endingUnlocked(state)`: đủ 3 secret đầu (Set; tìm lại không tăng; `unwritten-page` không tính).
  - Tên 8 khu theo §2.1 (The First Light, The Roots, The Workshop, The Milestones, The Old Trail, The Horizon, The Quiet Shore, The Last Postcard) — giữ tiếng Anh ở cả hai ngôn ngữ; tiêu đề sổ: "Atlas Journal" / "Sổ Atlas".
- Được sửa: `src/features/journal/**`, `tests/unit/journal/model.test.ts`
- Test: thứ tự 8 dòng; visit lặp không nhân đôi; secrets không có trong entries; blankPages đúng; endingUnlocked chỉ khi đủ 3 secret đầu; reset xóa hết; source không chứa `localStorage`/`sessionStorage`/`document.cookie`/`location` (test đọc file).
