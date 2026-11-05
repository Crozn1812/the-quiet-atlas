## TICKET B2-042 — Xe GD110 trong world: lên/xuống xe (E), lái tay, Auto Cruise (C)

- Trạng thái: Assigned → Codex, đợt 20, nhánh `lane/B2-042`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/vehicle/model.ts` (B2-015): `VehicleState`, `VehicleInput`, `mount` / `dismount`, `VEHICLE_LIMITS`, cruise cancel reasons; corridor.
  - `src/features/vehicle/labels.ts`.
  - `src/features/world/vehicle/` (B2-048): `createGd110`, `createVehicleView().update(state, corridor, dt)`.
  - `src/features/world/index.ts`: interaction targets (`kind`), locomotion, camera, intro/teleport locks, pause reasons, character root/animator.
  - `src/features/world/layout/path.ts` (corridor từ path).
- Spec:
  - §7.5: arcade có giới hạn; chạy trong hành lang đường (spline); manual và cruise dùng cùng hệ collider; E xuống xe chỉ khi có chỗ đứng an toàn; cruise chậm hoặc dừng trước vật cản; Esc, C, mở UI hay mất focus đều hủy cruise ngay.
  - §2: E lên/xuống xe.
  - §6.2: không lưu.
- **Ngoại lệ vùng file:** chỉ ticket này sửa `src/features/world/index.ts` trong lúc nó đang chạy.

### Việc

1. **Đặt xe GD110** dựng sẵn cạnh First Light, lệch khỏi đường 2 m, không chồng biển chỉ đường. Tạo một interaction target `kind: "vehicle"` với hint EN/VI ("E — Lên xe" / "E — Ride").
2. **E tại xe → lên xe** (theo `mount`):
   - Ẩn nhân vật, hoặc gắn nhân vật ngồi trên xe nếu đơn giản: đặt root lên yên, animation idle.
   - Camera theo xe, xa hơn khoảng 30 %.
3. **Lái tay:** W/S tăng/giảm tốc, A/D lái, áp dụng giới hạn của `model.ts`.
   - Xe chỉ chạy trong corridor của path.
   - Va chạm thì dùng chính collider hiện có: chặn ở thân cây/biển, không xuyên.
4. **C bật/tắt Auto Cruise:** tự chạy dọc path ở tốc độ cruise, chậm lại hoặc dừng trước vật cản.
   - Hủy ngay khi: Esc, C, mở bất kỳ UI nào (khi có pause reason overlay/journal), mất focus (blur), phanh.
5. **E khi đang trên xe → xuống xe:** chỉ khi `dismount(safeGround)` cho phép. Chỗ đứng là đất khô cạnh xe, ngoài nước. Không cho thì hiện hint "Chưa có chỗ dừng an toàn" / "No safe place to stop".
6. **Ràng buộc chung:**
   - Teleport hoặc intro đang chạy thì không lên xe.
   - Teleport khi đang trên xe: xuống xe trước, đặt xe lại chỗ cũ.
   - Có `container.dataset.worldVehicle = "parked" | "manual" | "cruise"` cho e2e.
   - Unmount dọn sạch.

### Được sửa

- `src/features/world/index.ts`
- `src/features/interaction/targets.ts`
- `src/features/world/copy.ts`
- `src/features/vehicle/**` (chỉ khi cần sửa nhỏ, ghi lý do)
- `tests/unit/world/contract.test.ts`
- Test mới `tests/unit/world/vehicle-wiring.test.ts`

### Test

- Lên xe khi ở gần (E) → `manual`; lái tay di chuyển trong corridor.
- Không xuyên collider: đặt xe chạy thẳng vào thân cây, xe dừng.
- C → `cruise`, đi dọc path. Mỗi lý do hủy (Esc, C, pause overlay, blur, phanh) đều về `manual`.
- Xuống xe chỉ khi chỗ đứng an toàn; không an toàn thì giữ trên xe và có hint.
- Teleport hoặc intro chặn lên xe.
- Unmount sạch listener và DOM.
- Các test contract, intro, teleport cũ vẫn pass.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` PASS. Không commit.
