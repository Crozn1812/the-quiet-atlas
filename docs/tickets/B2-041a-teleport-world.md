## TICKET B2-041a: Dịch chuyển, phía world (8 biển, sương chuyển cảnh, đặt nhân vật)

- Trạng thái: Assigned → Codex, đợt 18, nhánh `lane/B2-041a`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/navigation/` (B2-013): `SIGNPOSTS`, `arrivalPoint`, máy trạng thái `createTeleport`.
  - `src/features/navigation/events.ts`: Lead đã chốt hợp đồng sự kiện.
    - World → UI: `tqa:teleport-choose { from }`
    - UI → world: `tqa:teleport-to { to }` và `tqa:teleport-cancel`
    - Đã có từ B2-013: `tqa:teleport-start` / `tqa:teleport-end`
  - `src/features/world/index.ts`: props, interaction, `tqa:pause`, intro `introPending()`
  - `docs/adr/0008-*.md`
- Spec:
  - §7.2: chọn khu tại bảng; sương chuyển cảnh; xuất hiện cạnh bảng của khu đích; reduced motion dùng fade ngắn.
  - §6.2: không lưu.
- **Ngoại lệ vùng file:** được sửa `src/features/world/index.ts` (ticket duy nhất sửa file này trong đợt 18) và `src/features/interaction/targets.ts`.

### Việc

1. **8 biển dịch chuyển** đặt tại `SIGNPOSTS`.
   - Dùng mesh hộp tạm như biển hiện có. Lead sẽ thay bằng prop vẽ tay của B2-046.
   - Là target tương tác loại `teleport`, khác loại target mở nội dung.
   - Biển First Light hiện có vẫn giữ vai trò mở nội dung. Đặt biển dịch chuyển lệch ít nhất 2 m để hai biển không chồng nhau.
2. **E hoặc click** tại biển dịch chuyển phát `tqa:teleport-choose { from }` (bubbles: false).
   - World **không tự pause**. UI sẽ gửi `tqa:pause` lý do `overlay` như mọi overlay khác.
3. **Nghe `tqa:teleport-to { to }`** và chạy `createTeleport` qua 3 pha:

   | Pha | World làm gì |
   |---|---|
   | fadingOut | lớp giấy HTML phủ (`aria-hidden`), opacity 0→1 |
   | moving | teleport physics tới `arrivalPoint(to)`, đặt yaw, gọi `composed.update` để snap |
   | fadingIn | lớp giấy mờ dần về 0 |

   - Phát `tqa:teleport-start { from, to }` khi bắt đầu và `tqa:teleport-end { to }` khi xong.
   - Khóa input trong lúc `inputLocked`.
   - `tqa:teleport-cancel` đưa máy trạng thái về idle.
   - Bỏ qua yêu cầu khi intro đang chạy hoặc đang teleport.
   - Reduced motion lấy theo `matchMedia`.
4. Đặt `container.dataset.worldTeleport = "idle" | "active"` để e2e đọc.

### Được sửa

- `src/features/world/index.ts`
- `src/features/interaction/targets.ts`
- `src/features/world/copy.ts`: nhãn hint "E — Đi tới…" / "E — Travel…"
- `tests/unit/world/contract.test.ts`
- Test mới `tests/unit/world/teleport-wiring.test.ts`

### Test

- 8 biển ở đúng vị trí.
- E tại biển phát `teleport-choose` với `from` đúng.
- Sau `teleport-to`:
  - phát đủ chuỗi start…end;
  - vị trí cuối bằng `arrivalPoint(to)` ±0,1 m;
  - input bị khóa trong lúc chạy.
- `teleport-cancel` hoạt động.
- Reduced motion dùng fade ngắn.
- Bỏ qua yêu cầu khi intro đang playing.
- Unmount giữa chừng thì sạch listener và DOM.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0. Không commit.
