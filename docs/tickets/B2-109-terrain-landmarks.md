## TICKET B2-109 — Địa hình có dấu mốc: đồi Milestones, mỏm cao Horizon, bờ dốc nhẹ Workshop

- Trạng thái: Assigned → Codex, đợt 21, nhánh `lane/B2-109`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/world/terrain/height.ts`: thung lũng, đường bờ biển, vũng nguồn, ford dưới cầu, bảo vệ zone 0,4 m
  - `src/features/world/layout/zones.ts`
  - Spec §2.1 ("Bia đá trên đồi", "Mỏm cao hướng biển", "Xưởng cạnh suối")
  - Spec §7.1 (dấu mốc địa hình hỗ trợ định hướng; suối là trục)

### Việc (`height.ts`)

Thêm các "dấu mốc" địa hình **mềm, liên tục**, tính theo vị trí zone trong `ZONES`:

1. **Milestones:** một **đồi tròn** cao hơn nền xung quanh 6–9 m.
   - Tâm lệch khỏi đường đi 15–25 m về phía xa suối.
   - Đường đi leo lên sườn đồi với độ dốc ≤ 13 % (cùng ngưỡng với ford).
   - Zone nằm trên sườn, có tầm nhìn.
2. **Horizon:** một **mỏm cao** nhô ra phía biển, cao hơn nền 10–14 m.
   - Mép mỏm dốc hơn ở phía biển (không phải vách đứng: tối đa 0,6 m chênh trên 0,5 m ngang, để test coast cũ vẫn pass).
   - Đường đi lên mỏm dốc ≤ 13 %.
3. **Workshop:** một **bậc thềm phẳng** ven suối, rộng khoảng 10 × 8 m, để dựng chái xưởng.

### Ràng buộc

- Hàm vẫn thuần, liên tục, tất định.
- Đường đi và mọi zone vẫn khô (≥ 0,4 m trên mặt nước).
- Spawn, nguồn suối, cửa biển, đường bờ không đổi.
- Không mốc nào chặn tầm nhìn từ spawn xuôi suối.

### Được sửa

- `src/features/world/terrain/height.ts`
- `tests/unit/world/river-terrain.test.ts`
- `tests/unit/world/coast.test.ts`
- Test mới `tests/unit/world/terrain-landmarks.test.ts`

### Test

- Đồi Milestones và mỏm Horizon đạt chiều cao tương đối như trên.
- Độ dốc đường đi ≤ 13 % trên toàn tuyến (lấy mẫu 0,5 m).
- Bậc thềm Workshop phẳng (biên độ ≤ 0,3 m trong vùng 10 × 8 m).
- Các test địa hình, bờ biển, nguồn suối cũ pass. Nếu đổi giá trị kỳ vọng thì phải ghi lý do.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
