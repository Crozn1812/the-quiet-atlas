## TICKET B2-043b: Nối cinematic mở đầu vào world, có nút Skip

- Trạng thái: Assigned → Codex, đợt 17, nhánh `lane/B2-043b`
- Đọc trước:
  - `docs/tickets/_common-b2.md`
  - `src/features/world/cinematic/intro.ts`, `controller.ts` (B2-060: `createIntroController({ gameplayPose, reducedMotion })`, `tick(dt)` → pose / `mistBoost` / `letterbox`, `skip()`)
  - `src/features/world/index.ts`: vòng lặp, camera, input, các phần tử HUD mà world tự tạo trong container (hint "E — …"), `tqa:pause`
  - `src/features/world/scene/compose.ts`: `worldSpawn`, camera gameplay ban đầu
- Spec:
  - §2: cinematic cận cảnh lá, nước, sương rồi lộ nhân vật, **có Skip**.
  - §6.2: mỗi lần Enter World đều phát, không lưu "đã xem".
  - §9: reduced motion, bàn phím.
  - Taste §5.4: chuyển động chậm, chữ ít.
- **Ngoại lệ vùng file (Lead cho phép):** ticket này được sửa `src/features/world/index.ts`. Lead đang sửa song song `scene/compose.ts` / `scene/paper.ts` / `art/`, nên **không sửa 3 chỗ đó**. Cần API mới từ compose thì ghi trong bàn giao.

### Việc

1. Khi world mount xong và render frame đầu: nếu không bị pause, bắt đầu intro.
   - Lấy pose gameplay ban đầu từ camera hiện có.
   - `reducedMotion` lấy từ `matchMedia("(prefers-reduced-motion: reduce)")`.
2. Khi intro đang phát:
   - Camera theo `tick(dt)`.
   - **Khóa input di chuyển và tương tác**, nhưng vẫn render.
   - `mistBoost` cộng thêm vào cường độ sương qua `paperPass.setMist({ strength })`; khi kết thúc trả về giá trị gốc.
   - Letterbox làm bằng 2 dải giấy HTML trên và dưới (`aria-hidden`), không cần shader.
3. **Nút Skip:** `button` do world tạo trong container, cạnh hint hiện có.
   - Nhãn theo locale: "Skip" / "Bỏ qua". Đổi được khi có `tqa:set-locale`.
   - Esc hoặc Enter khi nút đang focus thì skip.
   - Focus vào nút khi intro bắt đầu, **trừ khi** focus đang ở phần tử khác ngoài canvas.
   - Khi intro xong: gỡ nút, trả focus về canvas.
4. `container.dataset.worldIntro` = `"playing"` | `"done"`. Phát `tqa:intro` `{ state }` (bubbles: false) mỗi khi đổi trạng thái. Lead dùng hook này cho e2e và perf.
5. `tqa:pause` khi intro đang phát: dừng cả intro, resume thì phát tiếp.
   - Quality, locale và context-lost giữ hành vi hiện tại.
   - Unmount giữa chừng không để rò rỉ: listener, DOM, rAF.
6. Hook test: nếu `window.__tqaSkipIntro === true` thì không phát intro (vào thẳng `done`). Chỉ là cờ đọc, không lưu ở đâu. Lead sẽ đặt cờ này trong e2e cũ.

### Được sửa

- `src/features/world/index.ts`
- `src/features/world/cinematic/**`
- `src/features/world/copy.ts` (nhãn Skip)
- `tests/unit/world/contract.test.ts`
- `tests/unit/world/cinematic*.test.ts`
- file test mới `tests/unit/world/intro-wiring.test.ts`

### Test bắt buộc

- Sau mount thì `worldIntro = "playing"` và nút Skip tồn tại.
- Bấm Skip thì `done`, camera đúng pose gameplay (sai số < 1e-3), input mở khóa, nút bị gỡ.
- Phím di chuyển trong lúc intro không đổi vị trí người chơi.
- Reduced motion: `done` trong ≤ 0,5 s mô phỏng.
- `__tqaSkipIntro` thì `done` ngay.
- Pause dừng tiến độ intro.
- Unmount giữa intro thì không còn listener: đếm add/remove.
- **Contract test cũ phải vẫn pass:** đặt `__tqaSkipIntro` hoặc skip trong test, ghi lý do.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0; dán dòng tổng kết. Không commit.
