## TICKET B2-130 — Bờ suối dưới đồi Milestones / mỏm Horizon: không vách răng cưa

- Nhánh `lane/B2-130`. Được sửa: `src/features/world/terrain/height.ts`, `tests/unit/world/terrain-landmarks.test.ts`, `tests/unit/world/river-terrain.test.ts`.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` exit 0. Không commit.
- Vấn đề (Lead thấy trong tour `tools/styleframes/tour.html?zone=milestones&view=wide`): đồi Milestones (B2-109) dâng dốc đứng sát mép suối → vách lộ các mặt tam giác lớn và mép dải suối răng cưa ở chân vách (lưới địa hình 2 m không theo kịp độ dốc). Horizon có hiện tượng tương tự ở sườn mỏm phía suối.
- Việc: trong `height.ts`, đồi/mỏm chỉ bắt đầu dâng **từ ≥ 18 m cách tâm suối** (dùng `nearestRiver(...).distance`), độ dốc tối đa của địa hình trong 30 m quanh suối ≤ 35° (tan ≤ 0,7 trên bước 2 m); giữ chiều cao đỉnh đồi/mỏm như B2-109; đường đi vẫn ≤ 13 %, mọi zone khô.
- Test: lấy mẫu lưới 2 m quanh suối dọc đoạn Milestones và Horizon → chênh cao giữa hai mẫu kề ≤ 1,4 m; các test địa hình/bờ/nguồn cũ pass.
