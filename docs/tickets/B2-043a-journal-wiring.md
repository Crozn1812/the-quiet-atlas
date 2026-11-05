## TICKET B2-043a: Nối Atlas Journal vào lớp giao diện world (phím J, ghi khu đã ghé)

- Trạng thái: Assigned → Codex, đợt 17, nhánh `lane/B2-043a`
- Đọc trước:
  - `docs/tickets/_common-b2.md`
  - `src/features/journal/model.ts` (B2-014: reducer + selectors)
  - `src/components/portfolio/journal/AtlasJournal.tsx` (B2-040: dialog, chưa nối)
  - `src/components/portfolio/WorldEntry.tsx`, `WorldContent.tsx`, `WorldMenu.ts`, `worldMenuControls.ts` (cách shell đang nghe sự kiện world: `tqa:open-content`, `tqa:pause`, menu, focus)
- Spec:
  - §7.2: J hoặc biểu tượng nhỏ, 8 dòng, bấm mở thẳng overlay khu, khu đã ghé có dấu mộc, không bản đồ, secrets không hiện.
  - §6.2: không lưu tiến trình. Mỗi lần Enter World sổ bắt đầu trống, không localStorage/sessionStorage/cookie/URL.
  - §8: JS ban đầu của Welcome/Quick không tăng.
  - §9: bàn phím, focus, reduced motion.

### Việc

1. Trạng thái journal sống trong shell world, khởi tạo bằng `initialJournal()` mỗi lần vào world và mất khi rời world:
   - Dùng `useReducer(journalReducer)`.
   - Khi world phát `tqa:open-content` với `{ zoneId }`, gửi action `visit`.
2. **Phím J** (khi world đang chạy, không trong ô nhập, không khi overlay khác đang mở) và **một mục trong menu world** ("Atlas Journal" / "Sổ Atlas") mở hoặc đóng sổ.
   - Khi sổ mở: gửi `tqa:pause` `{ reason: "journal", paused: true }` tới container world. Khi đóng: gửi `paused: false`.
   - Dùng đúng cơ chế `reason` có sẵn.
3. `AtlasJournal` **chỉ được import động** (`import()` / `next/dynamic`) sau khi đã vào world. Không đổi chunk ban đầu của Welcome/Quick.
4. Bấm một dòng trong sổ: đóng sổ, rồi mở overlay khu đó bằng đúng đường `tqa:open-content` / logic mở nội dung shell đang dùng (không teleport).
5. Locale: dùng `journalTitle` / `journalEntries` theo locale hiện tại của shell. Đổi ngôn ngữ khi sổ đang mở thì nhãn cập nhật.

### Được sửa

- `src/components/portfolio/WorldEntry.tsx`
- `src/components/portfolio/WorldContent.tsx`
- `src/components/portfolio/WorldMenu.ts`
- `src/components/portfolio/worldMenuControls.ts`
- `src/components/portfolio/journal/**`
- `tests/unit/portfolio/**`

**Không sửa** `src/features/world/**`.

### Test bắt buộc (unit, mô phỏng sự kiện)

- `tqa:open-content` → dòng tương ứng có dấu mộc.
- J mở và J/Esc đóng; khi mở có pause với reason `journal`, khi đóng hết pause.
- Ô input đang được focus thì J không làm gì.
- Bấm dòng thì gọi đúng đường mở overlay khu.
- Unmount rồi mount lại thì sổ trống.
- Không có lệnh gọi storage nào: grep mã nguồn trong test.
- `AtlasJournal` không bị import tĩnh từ `WorldEntry`: grep trong test.

### Điều kiện xong

- `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0; dán dòng tổng kết.
- Không chạy e2e: Lead thêm e2e.
- Không commit.
