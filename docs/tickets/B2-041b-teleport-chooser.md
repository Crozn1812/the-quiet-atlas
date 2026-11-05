## TICKET B2-041b: Dịch chuyển, phía giao diện (hộp chọn khu)

- Trạng thái: Assigned → Codex, đợt 18, nhánh `lane/B2-041b`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/navigation/events.ts`: hợp đồng sự kiện do Lead chốt. Nghe `tqa:teleport-choose { from }` trên container world; gửi lại `tqa:teleport-to { to }` hoặc `tqa:teleport-cancel`.
  - `src/components/portfolio/journal/WorldJournal.tsx` + `AtlasJournal.tsx`: mẫu mount sau Enter World, lazy, dialog, focus trap, pause reason.
  - `WorldMenu.ts`, `worldMenuControls.ts` (`pauseWorld`).
- Spec:
  - §7.2: chọn khu đích; chỉ 8 khu; không secrets; không bản đồ hay vị trí.
  - §9: bàn phím, focus, reduced motion.
  - §8: không tăng JS ban đầu.

### Việc

Tạo thư mục mới `src/components/portfolio/teleport/`:

1. **`TeleportChooser.tsx`**: dialog modal nền giấy, cùng phong cách Sổ Atlas.
   - Tiêu đề "Đi tới…" / "Travel to…".
   - 8 nút tên khu, dùng tên tiếng Anh như Journal.
   - Khu đang đứng: nút `disabled`, kèm "(đang ở đây)" / "(you are here)".
   - Esc hoặc nút Đóng: hủy (cancel).
   - Khi mở, focus vào nút của khu kế tiếp. Khi đóng, trả focus về canvas.
2. **`WorldTeleport.tsx` + `mountWorldTeleport(container, locale)`**:
   - Nghe `tqa:teleport-choose` và mở chooser bằng lazy import.
   - Gọi `pauseWorld(container, true, "overlay")` khi mở, gọi lại với `false` khi đóng.
   - Chọn một khu: đóng dialog rồi gửi `tqa:teleport-to { to }`.
   - Đóng mà không chọn: gửi `tqa:teleport-cancel`.
   - Có `setLocale`.
3. **Nối vào `WorldMenu.ts`** giống cách nối journal (mount, unmount, setLocale). Chỉ thêm, không đổi hành vi khác.

### Được sửa

- `src/components/portfolio/teleport/**`
- `src/components/portfolio/WorldMenu.ts`
- `tests/unit/portfolio/teleport*.test.tsx`

### Test

- Sự kiện choose mở dialog có 8 nút; nút của khu hiện tại bị `disabled`.
- Chọn một khu gửi đúng `tqa:teleport-to` và gửi pause `false`.
- Esc gửi cancel.
- Chooser không bị import tĩnh.
- Nhãn đúng cả locale vi và en.
- Đang có dialog khác mở thì bỏ qua sự kiện choose.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0. Không commit.
