## TICKET B2-224: nền rừng bình minh đọc được (bớt mảng tối đục)

- Đọc `_finish-common.md`, `B2-215-terrain-detail.md`, `B2-190-ground-surface.md`.
- Được sửa: `src/features/world/terrain/mesh.ts` (màu nền rừng) và/hoặc `src/features/world/materials/ramp.ts` (phần terrain detail), test terrain.
- Ảnh: `docs/showcase/27-hoan-thien-1/lead-review/ingame-spawn.webp`. Đo: độ sáng hiển thị trung bình **0,22**, rất ít tương phản; Lead đã thử bớt sương thì ảnh còn tối hơn (0,19), nên nguyên nhân là **màu nền**, không phải sương.

### Việc

1. Nền rừng sáng hơn 15–25 % (luma albedo), ngả rêu vàng xanh (`grass` pha `grassDry` 0,2) ở chỗ có nắng, giữ đất ẩm tối gần suối.
2. Đốm nắng B2-215 rõ hơn: biên độ ±8 % → ±18 %, mảng to hơn (4–8 m), theo hướng mặt trời bình minh.
3. Giữ ý đồ bình minh le lói (Duy): không làm cả cảnh sáng như trưa; chỉ tăng tương phản nền.

### Test

- CPU: trung bình luma nền rừng tăng 15–25 %; độ lệch chuẩn trong ô 20 × 20 m tăng ≥ 1,5 lần.
- Tiêu chí ánh sáng B2-180 (luma tham chiếu rừng 0,26–0,32) vẫn pass; test terrain/coast cũ pass.
