## TICKET B2-229: biển hoàng hôn đúng màu (xa bờ xanh tím, không lục đậm)

- Đọc `B2-181-water-follows-light.md` (mục tiêu gốc: gần bờ xanh ngọc tối, **xa bờ xanh tím đậm**, vệt nắng cam vàng), `B2-181c`, `B2-219`. Được sửa: `src/features/world/water/material.ts` (phần SEA), test biển.
- Ảnh trong game: `docs/showcase/27-hoan-thien-1/ingame/last-postcard.webp`: biển là **xanh lục đậm phẳng**, vệt nắng cam **gắt, cứng** như sơn.

### Việc

1. Xa bờ (> 40 m): pha về `seaDeep` + `indigo` (xanh tím), gần bờ ngọc tối; chuyển mượt theo khoảng cách bờ đã có.
2. Vệt nắng cam: mềm hơn, hẹp hơn, chỉ trong hành lang nhìn về mặt trời (±12°), cường độ ≤ 70 % hiện tại, mép mờ.
3. Giữ test: luma biển t = 0,93 ≤ 0,35, R/B vệt nắng, vệt ≤ 40 m.

### Test

- CPU: màu biển xa bờ ở t = 0,95 có B > G và B > R; gần bờ G ≥ B.
- Vệt nắng: độ rộng góc nửa cường độ ≤ 12°. Test cũ pass.
