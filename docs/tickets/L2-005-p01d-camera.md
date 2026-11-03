## TICKET L2-005 — P01-D camera 360° + zoom + spring arm + dither tán lá; hợp đồng ADR 0008 phía world

- Trạng thái: **Done — merged vào main** (2026-11-04)
- Lane / milestone: L2 / B1 (P01-D)
- Mục tiêu (theo trải nghiệm người chơi): xoay camera quanh nhân vật 360° bằng ← → hoặc kéo chuột trên vùng trống (không pointer lock), vuốt hai ngón ngang trên touchpad; zoom bằng + / − / cuộn trong giới hạn; camera không chui xuống đất; tán cây che nhân vật thì mờ dần thay vì kéo camera vào.
- Spec liên quan: §6.2 (mục 1, 3, 8), §6.4 (bảng điều khiển: hàng Xoay camera, Zoom), §7.4 (spring arm, dither tán lá), §13 T05, T06; ADR 0008
- Được sửa: `src/features/world/`, `src/features/interaction/`, `src/state/`, `tests/unit/world/`, `tests/unit/interaction/`, `tests/unit/state/`, `docs/adr/0002-physics.draft.md` (chỉ thêm mục P01-D: tham số camera)
- Không được sửa: mọi thứ khác; đặc biệt `src/app/`, `src/components/`, `package.json`, lockfile, config gốc. Không `pnpm add/install`. Không asset file.
- Việc:
  1. Camera orbit: yaw liên tục 360° (← → và kéo chuột trái trên canvas; `wheel` có `deltaX` ngang từ touchpad cũng xoay), pitch cố định hoặc giới hạn hẹp. Locomotion (L2-004) đã đọc yaw camera — giữ nguyên.
  2. Zoom: `+`/`-` (`KeyboardEvent.code` Equal/Minus/NumpadAdd/NumpadSubtract), cuộn chuột (`deltaY`), chụm hai ngón (`wheel` + `ctrlKey`); kẹp trong [min, max] là hằng số đặt tên, ghi ADR 0002. `wheel` chỉ `preventDefault` khi con trỏ trên canvas.
  3. Spring arm: raycast từ nhân vật tới camera, rút ngắn khi chạm địa hình/thân cây (bỏ qua tán lá); damping. Debug assert (opts `debug`): đếm frame camera nằm dưới địa hình → phải 0 (T05).
  4. Dither tán lá: tán cây nằm giữa camera và nhân vật mờ dần (dither/alpha-hash), không đổi collider. Hàm thuần chọn instance bị che để unit test.
  5. **ADR 0008 phía world** (đọc `docs/adr/0008-ui-world-event-contract.md`): lắng nghe `tqa:pause`, `tqa:set-quality` (đổi mật độ cây/DPR/shadow tại chỗ, không remount, không đổi collider, không reset vị trí), giữ `tqa:return-to-path`; ghi `data-world-paused`, `data-world-quality`; phát `tqa:world-state`. Quality hiện tại khởi tạo từ `opts.quality` (mặc định balanced).
  6. Input camera tuân theo pause và ô nhập (không xoay khi đang gõ / khi pause).
- Điều kiện xong:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` exit 0
  - Unit test: yaw quấn 360° liên tục; zoom kẹp min/max; spring arm rút ngắn khi có vật cản (hàm thuần); chọn tán lá bị che; reducer pause với lý do `overlay`; set-quality không đổi số collider và không đổi vị trí
  - Không commit (sandbox chặn); Lead commit
- Bàn giao: tóm tắt, tham số đã chốt, lệnh + exit code, việc chưa làm (log T05/T06 trên trình duyệt: NOT RUN).
