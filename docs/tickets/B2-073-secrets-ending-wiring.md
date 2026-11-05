## TICKET B2-073: Secrets và ending trong world

- Trạng thái: Assigned → Codex, đợt 20, nhánh `lane/B2-073`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/story/` (B2-070): `SECRETS`, `nearestSecret`, `storyReducer`, `storyFeedbackText`
  - `src/features/world/props/secrets.ts` (B2-071): `createSecretLandmark`
  - `src/features/world/cinematic/ending.ts` + `ending-controller.ts` (B2-061)
  - `src/features/journal/model.ts`: `findSecret`, `blankPages`
  - `src/components/portfolio/journal/WorldJournal.tsx`: shell giữ state journal
  - `src/features/world/index.ts`: intro (mẫu nối cinematic, Skip, letterbox), teleport, vehicle, interaction `kind`
- Spec:
  - §2, §7.5: Set ID; Unwritten Page trước khi đủ 3 secret chỉ cho phản hồi ẩn dụ; ending 30–45 s có Skip; khung cuối dẫn sang Last Postcard.
  - §7.2: secrets không có bảng, không xuất hiện trong journal; sau secret đầu tiên, journal hiện trang trắng.
  - §6.2: memory-only.
  - §13 Q16.
- **Ngoại lệ vùng file:** chỉ ticket này sửa `src/features/world/index.ts` trong lúc nó chạy.

### Việc

1. **Đặt mốc:** 4 mốc `createSecretLandmark` tại vị trí của `SECRETS`, chân đặt trên `surfaceHeight`. Mỗi mốc là một interaction target `kind: "secret"`.
   - Hint chỉ là "E" kèm một từ trung tính EN/VI, ví dụ "E — …". Không lộ tên secret.
   - Vòm gương và ghế ngồi có collider đơn giản (hộp). Lối đá và chuông gió không có collider.
   - `wind-chime`: node `chimes` lắc nhẹ. Reduced motion thì đứng yên.
2. **E tại secret:**
   - `storyReducer` discover.
   - Hiện câu `storyFeedbackText` trong một dòng HTML nhỏ, `aria-live="polite"`, tự ẩn sau 6 s.
   - Phát `tqa:secret-found { id, count }` (bubbles: false). Phía shell, journal nghe sự kiện này rồi dispatch `findSecret`, nên trang trắng hiện ra. Được thêm listener trong `WorldJournal.tsx`.
   - Forgotten Sound: âm thanh để sau; văn bản chính là bản tương đương (§9).
3. **Khi `endingState` = `ready`, ngay khi chạm Unwritten Page lần cuối:** `startEnding` rồi phát ending.
   - Khóa input. Camera theo `ending.tick`. Dải giấy letterbox.
   - Nút Skip dùng chung logic với intro.
   - `sunsetBoost` đẩy grade về hoàng hôn, qua `directGrade` (time of day → 1).
   - Kết thúc tự nhiên hoặc Skip: `finishEnding(true)`, đặt nhân vật tại `finalPlayerPosition`.
   - `container.dataset.worldEnding = "idle" | "playing" | "seen"`. Phát `tqa:ending { state }`.
   - Mở lặp không tạo instance thứ hai.
   - Đang ở trên xe: tự xuống xe trước.
   - Teleport bị chặn trong lúc ending.
4. **Reset:** mỗi lần mount là một phiên mới, story về ban đầu. Đổi ngôn ngữ không reset secret (§6.2): chỉ dịch lại câu phản hồi.

### Được sửa

- `src/features/world/index.ts`
- `src/features/interaction/targets.ts`
- `src/features/world/copy.ts`
- `src/components/portfolio/journal/WorldJournal.tsx`
- `tests/unit/world/contract.test.ts`
- Test mới:
  - `tests/unit/world/secrets-wiring.test.ts`
  - `tests/unit/portfolio/journal-secrets.test.tsx`

### Test

- 4 mốc ở đúng vị trí.
- Discover lặp không đếm trùng.
- Unwritten Page trước khi đủ 3 → câu "not yet", ending không mở.
- Đủ 3 rồi chạm Unwritten Page → ending `playing`, input khóa.
- Skip → `seen`, nhân vật ở cạnh Last Postcard.
- Mở ending 2 lần chỉ ra 1 instance.
- `secret-found` làm journal hiện trang trắng.
- Đổi locale không mất secret.
- Unmount sạch.
- Các test cũ (contract, intro, teleport, vehicle) vẫn pass.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0. Không commit.
