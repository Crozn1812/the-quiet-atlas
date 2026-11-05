## TICKET B2-111 — Menu world đủ mục theo spec §6.4

- Trạng thái: Assigned → Codex, đợt 21, nhánh `lane/B2-111`
- Đọc trước:
  - `_common-b2.md`
  - `src/components/portfolio/WorldMenu.ts`: hiện có chất lượng, ngôn ngữ, Journal, mascot, về đường, bảng phím, rời world, đóng.
  - `src/i18n/world-menu.ts`
  - `worldMenuControls.ts`
  - Spec §6.4: "Menu gồm: chất lượng, âm thanh, giảm chuyển động, ngôn ngữ, mascot, bảng phím, 'Mở Quick Portfolio'".
  - Spec §9: menu dùng được bằng bàn phím, có focus trap.
  - Taste §5.4: UI im lặng, kiểu tạp chí.

### Việc

1. **"Giảm chuyển động: Bật/Tắt"** (`aria-pressed`).
   - Mặc định theo `prefers-reduced-motion`.
   - Bấm thì gửi `tqa:set-motion { reduced: boolean }` tới container world. Lead nối phía world ở B2-100.
   - Lưu trong memory, không storage.
2. **"Âm thanh: Bật/Tắt"**: điều khiển cùng trạng thái với nút Sound trên HUD.
   - Bấm toggle ở menu = click nút Sound HUD (`#sound-reason` là mô tả; tìm nút qua `aria-describedby="sound-reason"`). Không tạo AudioContext riêng.
   - `aria-pressed` đồng bộ hai chiều.
3. **"Mở Quick Portfolio"**: liên kết `/<locale>/quick/`.
4. **Bảng phím:** cập nhật đủ phím:
   - WASD / Shift chạy;
   - ← → xoay; + / − zoom; kéo chuột xoay; cuộn zoom;
   - E tương tác / lên-xuống xe; C Auto Cruise; J Sổ Atlas;
   - Esc đóng UI / mở menu.

   Nhãn EN/VI.
5. **Thứ tự mục**, nhóm có khoảng trắng, kiểu tạp chí:
   1. Sổ Atlas
   2. Quay về đường
   3. Chất lượng
   4. Âm thanh
   5. Giảm chuyển động
   6. Mascot
   7. Ngôn ngữ
   8. Bảng phím
   9. Mở Quick Portfolio
   10. Rời world
   11. Đóng

### Được sửa

- `src/components/portfolio/WorldMenu.ts`
- `src/components/portfolio/worldMenuControls.ts`
- `src/i18n/world-menu.ts`
- `tests/unit/portfolio/world-menu*.test.ts(x)` (mới hoặc sửa)

### Test

- Có đủ mục, đúng thứ tự.
- Toggle motion gửi đúng sự kiện; mặc định theo matchMedia giả.
- Toggle sound trong menu bấm nút HUD và `aria-pressed` đồng bộ.
- Link Quick đúng locale.
- Bảng phím có đủ phím, đủ EN/VI.
- Focus trap vẫn hoạt động.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0. Không commit.
