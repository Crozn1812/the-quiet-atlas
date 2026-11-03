## TICKET L2-006 — P01-E: bảng chỉ đường + vùng tương tác E/click, gợi ý, phát `tqa:open-content`

- Trạng thái: **Done — merged vào main** (2026-11-04)
- Lane / milestone: L2 / B1 (P01-E)
- Mục tiêu (theo trải nghiệm người chơi): trong rừng thử có **một bảng chỉ đường** (placeholder hình học, ghi rõ "placeholder") và **một vật thể tương tác** (bàn làm việc của The Workshop). Đến gần trong bán kính → hiện gợi ý "E" (văn bản, có `aria-live`); nhấn E hoặc click vào vật thể → mở nội dung khu. Click xa ngoài bán kính không mở gì. Đóng nội dung → nhân vật đứng đúng chỗ cũ, hướng cũ.
- Spec liên quan: §6.2 mục 1, 2, 5; §6.4 (E, click); §7.2 (bảng chỉ đường — ở ticket này chỉ là vật thể tương tác, chưa dịch chuyển); §13 T07; §16.1; ADR 0008 (phần "Mở rộng 2026-11-04")
- Được sửa: `src/features/world/`, `src/features/interaction/`, `src/state/`, `tests/unit/world/`, `tests/unit/interaction/`, `tests/unit/state/`, `docs/adr/0002-physics.draft.md` (chỉ thêm bán kính tương tác đã chốt)
- Không được sửa: mọi thứ khác; đặc biệt `src/app/`, `src/components/`, `package.json`, lockfile, config gốc. Không `pnpm add/install`. Không asset file.
- Ràng buộc:
  - Chọn mục tiêu: hàm thuần `pickTarget(player, targets, radius, lineOfSight?)` → một mục tiêu gần nhất trong bán kính (chốt giá trị, ghi ADR 0002 — T07 "bán kính chốt ADR"); có kiểm đường nhìn bằng raycast nếu cần.
  - E đọc theo `KeyboardEvent.code === "KeyE"`; bỏ qua khi target là ô nhập/dialog; không vừa mở bảng vừa lên xe (chưa có xe — chỉ cần một hành động/lần nhấn).
  - Click: raycast từ camera qua con trỏ; chỉ mở nếu trúng vật thể **và** người chơi trong bán kính.
  - Phát `tqa:open-content` `{ zoneId: "workshop" }` (bàn) hoặc `"first-light"` (bảng chỉ đường gần spawn). Ghi/gỡ `data-world-hint`.
  - Nghe `tqa:content-closed` → thêm `zoneId` vào `sessionProgress.visitedZones` (memory). Không tự resume — pause do UI điều khiển qua `tqa:pause`.
  - Không lưu gì ngoài memory.
- Điều kiện xong: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` exit 0; unit test: `pickTarget` (gần nhất, ngoài bán kính → null, hai mục tiêu cách đều chọn ổn định), E trong ô nhập không phát event, click xa không phát event, `content-closed` ghi visitedZones. Không commit; Lead commit.
- Bàn giao: tóm tắt, tham số chốt, lệnh + exit code, việc chưa làm.
