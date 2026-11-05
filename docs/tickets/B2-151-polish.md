## TICKET B2-151 — Đánh bóng sau vòng 3 (Lead thấy trong tour 2026-11-05)

1. `zones/first-light.ts`: vệt nắng đang thành **tấm cam đặc** (giống tấm ván). Làm trong suốt thật (opacity 0,12–0,18, `depthWrite: false`, màu `dusk` lerp `paper` 0,7), mép mờ dần (vertex alpha hoặc 2–3 lớp mỏng), không đổ bóng.
2. `water/ribbon.ts` + `terrain/height.ts`: mép dải suối **răng cưa ở đoạn ven biển** (Quiet Shore approach, bờ trái) — áp cùng cách B2-130 (độ rộng lòng kênh ≥ độ rộng dải + 1 m) cho toàn tuyến, không chỉ dưới dấu mốc.
- Kiểm bằng mắt: `/tour.html?zone=first-light&view=approach`, `?zone=quiet-shore&view=approach`.
