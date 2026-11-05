## TICKET B2-195: suối ở đồi nằm trong rãnh sâu vách đứng

- Được sửa: `src/features/world/terrain/height.ts` (**chỉ** phần khoét lòng suối/bờ), test terrain/river liên quan. Không sửa `terrain/mesh.ts` (tô màu).
- Đọc `_dirA-common.md`. Ảnh: `docs/showcase/26-asset-ky/lead-review/02-t10a-hill-90.webp`.

### Lead thấy

- Đoạn đồi (t ≈ 0,55): suối là một **rãnh sâu có vách gần thẳng đứng**, mặt nước nằm thấp dưới mép cỏ cả mét, nhìn như kênh bê tông.

### Việc

- Bờ suối ở đồi thoải: độ dốc bờ ≤ 35° trong 1–3 m từ mép nước; mặt nước thấp hơn mép cỏ 0,2–0,5 m (không phải > 1 m).
- Giữ nguyên ở rừng (bờ có thể dốc hơn, đá), giữ cầu (B2 bridges) và đường đi không ngập.
- Không làm nước tràn ra ngoài dải (`riverWidthAt`).

### Test

- Lấy mẫu dọc suối t 0,4–0,75: chênh cao mép nước → mép cỏ (3 m) 0,2–0,5 m; độ dốc lớn nhất trong dải bờ ≤ 35°.
- Lối đi và nền khu không thay đổi độ cao quá 0,05 m.
- Test terrain/river/bridges cũ pass.
