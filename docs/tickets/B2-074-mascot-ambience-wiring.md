## TICKET B2-074: Mascot trong world, nút bật/tắt mascot, sự kiện âm thanh môi trường

- Trạng thái: Assigned → Codex, đợt 20, nhánh `lane/B2-074`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/mascot/` (B2-072): `createMascotMesh`, follow, hints.
  - `src/features/audio/mix.ts` (B2-080): `ambienceMixAt`.
  - B2-081 (nút Sound): shell nghe `tqa:ambience { stream, wind, birds, sea }` trên container world, tối đa 4 Hz.
  - `src/features/world/index.ts`.
  - `src/components/portfolio/WorldMenu.ts`: menu có chất lượng, ngôn ngữ, journal.
- Spec:
  - §2: mascot bay theo, gợi ý theo khu, có thể tắt.
  - Dòng 289: menu có mục mascot.
  - Dòng 379: không lặp dồn dập, không cướp focus.
  - §6.2: memory-only.
- **Ngoại lệ vùng file:** chỉ ticket này sửa `src/features/world/index.ts` trong lúc nó chạy.

### Việc

1. **World: thêm mascot.**
   - Follow nhân vật mỗi frame.
   - Snap theo nhân vật khi teleport, khi intro hoặc ending trao lại điều khiển, khi lên/xuống xe.
   - Ẩn trong lúc intro và ending.
   - Gợi ý: khi vào zone (theo khoảng cách tới `ZONES`) và `hints` cho phép, hiện câu gợi ý trong dòng HTML nhỏ cạnh hint E, có `aria-live="polite"`. Không lấy focus. Tự ẩn sau 6 s.
2. **Sự kiện `tqa:set-mascot { enabled }` (UI → world):**
   - Tắt: ẩn mesh, ngừng gợi ý.
   - Gán `container.dataset.worldMascot = "on" | "off"`.
   - Thêm hợp đồng này vào phần bàn giao để Lead cập nhật ADR 0008.
3. **Menu:** thêm toggle "Mascot: Bật/Tắt" / "Mascot: On/Off" (`aria-pressed`). Bấm thì gửi `tqa:set-mascot`. Mặc định bật. Chỉ lưu trong memory.
4. **Âm thanh môi trường:** world phát `tqa:ambience` trên container, tối đa 4 Hz, `detail = ambienceMixAt({...})`. Đầu vào:
   - khoảng cách tới suối (`nearestRiver`);
   - biome của zone gần nhất;
   - time of day theo path;
   - khoảng cách tới biển (theo z và mực nước).

   Không phát trong lúc pause.

### Được sửa

- `src/features/world/index.ts`
- `src/features/world/copy.ts`
- `src/components/portfolio/WorldMenu.ts`
- `tests/unit/world/contract.test.ts`
- Test mới:
  - `tests/unit/world/mascot-wiring.test.ts`
  - `tests/unit/portfolio/mascot-toggle.test.ts`

### Test

- Mascot đi theo và snap khi teleport.
- Ẩn trong lúc intro.
- Tắt thì không có gợi ý và mesh bị ẩn.
- Gợi ý có cooldown.
- `tqa:ambience` không quá 4 Hz, mix ở rừng khác mix ở biển, im khi pause.
- Toggle trong menu gửi đúng sự kiện.
- Unmount sạch.
- Các test cũ vẫn pass.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0. Không commit.
