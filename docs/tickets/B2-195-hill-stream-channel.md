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

### Bổ sung (Lead, cùng file `height.ts`): mặt đất trồi qua đường nhựa ven biển

- Ảnh `docs/showcase/26-asset-ky/lead-review/road-verge-terrain-through-asphalt.webp` (đường tô hồng để dò): dọc mép phải đường đoạn Quiet Shore, **terrain cao hơn mặt đường** nên các mảng đất màu be đâm xuyên qua nhựa thành vết lở hình răng cưa.
- Việc: dưới mặt đường nhựa + lề (bề rộng thật trong `road/layout.ts`) terrain phải thấp hơn mặt đường ≥ 0,05 m; chuyển tiếp ra ngoài lề mượt trong 2–4 m (taluy), không tạo vách.
- Test: lấy mẫu dày (0,5 m) dọc đường t 0,8–1, ngang toàn bề rộng nhựa + lề: `terrain ≤ roadSurface − 0,05` ở mọi điểm.

### Lead trả lời (2026-11-06)

- **Được sửa thêm `src/features/world/road/layout.ts`** (và test road): mặt đường lấy độ cao terrain **trước** khi khoét nền đường, hoặc khoét terrain dưới đường xuống `roadSurface − 0,05` trong `height.ts` trong khi đường giữ cao độ gốc. Chọn cách nào cũng được, miễn đường không đổi cao độ quá 0,1 m so với hiện tại và test "terrain ≤ roadSurface − 0,05" pass.
