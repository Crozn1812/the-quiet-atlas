## TICKET B2-081 — Nút Sound bật âm thanh môi trường (nạp lazy, không tăng JS Welcome)

- Trạng thái: Assigned → Codex, đợt 20, nhánh `lane/B2-081`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/audio/` (B2-080): `createAudioController()` với `enable()` (chỉ sau thao tác người dùng), `disable()`, `update(...)`; `ambienceMixAt`.
  - `src/components/portfolio/WorldEntry.tsx`: nút Sound hiện `disabled` + `aria-describedby="sound-reason"`.
  - `src/i18n/messages.ts`: `soundReason: "Sound is under construction"`.
  - `WorldMenu.ts`.
- Spec:
  - §2: Welcome có nút Sound; âm thanh **chỉ phát sau thao tác bật** của người xem.
  - §6.2: tùy chọn chỉ nằm trong memory.
  - §8: **JS ban đầu Welcome không tăng** (đang 137,1 / 150 KB).
  - §9: `aria-pressed`, có văn bản thay thế.
- **Hợp đồng (Lead nối phía world):** world phát `tqa:ambience` trên container, tối đa 4 Hz, `detail = { stream, wind, birds, sea }` (mỗi giá trị trong [0,1]). Shell chỉ nghe sự kiện này.

### Việc

1. `WorldEntry.tsx` — bỏ `disabled` khỏi nút Sound. Nút thành toggle có `aria-pressed`.
   - **Bấm lần đầu:** `import()` động module mới `src/components/portfolio/sound/ambience-bridge.ts`, rồi gọi `controller.enable()` ngay trong handler (vẫn là user gesture).
   - **Bấm lần nữa:** `disable()`.
   - Ở Welcome: chỉ đổi trạng thái pressed và bật controller, chưa có mix. Vào world: bridge nghe `tqa:ambience` từ container world và gọi `controller.update`.
   - Rời world hoặc unmount: `disable()`, dispose, gỡ listener.
2. `ambience-bridge.ts`: nối controller với container. Không import `features/world`; import `features/audio` được phép.
3. `messages.ts`: thay `soundReason` bằng mô tả thật ("Ambient forest, stream and sea sounds" / "Âm thanh rừng, suối, biển") và nhãn trạng thái bật/tắt (EN/VI).
4. Không tự phát âm khi chưa bấm. Không lưu trạng thái.

### Được sửa

- `src/components/portfolio/WorldEntry.tsx`
- `src/components/portfolio/sound/**`
- `src/i18n/messages.ts`
- `tests/unit/portfolio/sound*.test.ts(x)`
- **Không sửa `tests/e2e`.** Lead sửa e2e đang kiểm nút disabled; ghi rõ trong bàn giao những e2e nào sẽ đổi.

### Test

- Chưa bấm thì không import module audio (mock `import()`), không có AudioContext.
- Bấm: `enable` gọi trong cùng handler; `aria-pressed` = true.
- Sự kiện `tqa:ambience` → `update` với đúng mix.
- Bấm lần 2 → `disable`.
- Unmount → dispose, gỡ listener.
- `messages` có đủ EN/VI.

### Điều kiện xong

- `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` **PASS**.
- Dán số Welcome JS gzip từ `check:bundle`; không được tăng quá 1 KB.
- Không commit.
