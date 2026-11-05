## TICKET B2-100: Nối 8 khu vào world; tương tác nội dung ở mọi khu; sự kiện zone-enter và set-motion

- Trạng thái: Assigned → Codex, đợt 22, nhánh `lane/B2-100`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/world/zones/types.ts` + 8 file `zones/*.ts` (B2-101…108)
  - `src/features/world/index.ts`: `contentProps` (hiện chỉ có biển First Light và bàn Workshop), targets theo `kind`, colliders, camera obstacles, teleport, vehicle, secrets, mascot, intro/ending
  - `src/features/world/scene/compose.ts`: `surfaceHeight`, foliage, ground
  - `src/features/world/copy.ts`: còn chữ "(placeholder)" / "(tạm)" / "P01-E"
  - ADR 0008
- **Ngoại lệ vùng file:** ticket này một mình sửa `src/features/world/index.ts`, `scene/compose.ts`, `copy.ts`.

### Việc

1. **Registry** `src/features/world/zones/index.ts`: map `ZoneId` → factory.
2. **Đặt 8 khu.** Với mỗi khu:
   - Dựng context: `heightAt(localX, localZ)` = `surfaceHeight(world)` − cao độ anchor; `onPath`; `underWater`; `seed`.
   - Đặt `group` tại anchor, xoay theo `lookDirection`.
   - Thêm vào scene.
   - Colliders là hộp cố định trong physics; dùng cơ chế collider sẵn có, không thêm dependency.
   - Thêm vào danh sách camera obstacles.
   - Gọi `update(dt, reducedMotion)` mỗi frame. Khi world pause thì truyền dt = 0 (§6.1: pause là đứng yên hoàn toàn).
3. **Interactable của khu thay `contentProps`.**
   - Mỗi khu có 1 target `kind: "content"` tại `interactable.position`.
   - Hint là "E — <label>" theo locale.
   - Bỏ biển First Light và bàn Workshop cũ (khu mới đã có vật thay thế).
   - Click hoặc E mở nội dung đúng khu (`tqa:open-content`), như hiện tại.
4. **Rừng không mọc đè lên khu:** cây và cỏ không đè lên vật của khu. Trong `compose.ts`, loại cây/cỏ trong bounding box collider của khu (cộng 1 m).
5. **`tqa:zone-enter { zoneId }`** (world → UI):
   - Phát khi nhân vật bước vào bán kính khu.
   - Hysteresis: ra khỏi bán kính + 4 m mới tính là rời khu.
   - Không phát trong cinematic.
6. **`tqa:set-motion { reduced }`** (UI → world):
   - Ghi đè `prefers-reduced-motion` cho toàn world: intro/ending, teleport, nước, mascot, chime, khu, nhân vật idle.
   - Đặt `data-world-motion = "reduced" | "full"`.
7. **`copy.ts`:** xóa mọi "(placeholder)", "(tạm)", "P01-E".
   - Mô tả canvas mới (EN/VI), không nhắc chữ tạm. Nói rõ điều khiển: WASD đi, Shift chạy, ←→/kéo xoay, +/−/cuộn zoom, E tương tác, J sổ, Esc menu.
   - Nhãn HUD góc trên (danh sách biển/bàn) đổi thành tên khu gần nhất, hoặc bỏ nếu thừa. Lead ưu tiên bỏ, vì đã có thẻ tên khu (B2-112).

### Được sửa

- `src/features/world/index.ts`, `scene/compose.ts`, `copy.ts`
- `src/features/world/zones/index.ts` (mới)
- `src/features/interaction/targets.ts`
- `tests/unit/world/contract.test.ts` và các test wiring liên quan
- Test mới `tests/unit/world/zones-wiring.test.ts`

### Test

- 8 khu được đặt đúng anchor và hướng.
- 8 interactable mở đúng `zoneId`.
- Không còn chuỗi "placeholder", "tạm", "P01".
- Colliders khu chặn được người chơi.
- Không cây hay cỏ nào trong vùng khu.
- `zone-enter` có hysteresis và không phát trong intro.
- `set-motion` đổi hành vi reduced motion của intro, khu, mascot.
- Pause thì mọi `update` của khu nhận dt = 0.
- Unmount dispose 8 khu.
- Các test cũ pass. Sửa kỳ vọng chỉ khi là hệ quả trực tiếp, và phải ghi lý do.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0. Không commit.
