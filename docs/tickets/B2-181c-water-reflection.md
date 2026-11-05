## TICKET B2-181c: phản chiếu trời của nước là bức xạ trời (suối ven biển đang đen)

- Được sửa: `src/features/world/water/material.ts`, test nước (`water.test.ts`, `water-lighting.test.ts`, `sea-sunset.test.ts`).
- Đọc `B2-181-water-follows-light.md`, `B2-181b-water-r2.md`, `_dirA-common.md`.
- Ảnh Lead: `docs/showcase/26-asset-ky/lead-review/t10a-sheet.webp` (hiện tại) và `t10b-sheet-sky-reflection-try.webp` (bản Lead thử).

### Lead thấy

- Hàng ảnh biển (dưới): suối chạy dọc bên trái đường ven biển là **một dải đen**. Hàng đồi (giữa): suối là rãnh xanh đậm.
- Nguyên nhân: `uSkyHorizon = skyHorizon × irradiance × 0.08/0.12` (dòng ~273). Phản chiếu Fresnel phải mang **màu trời** (bức xạ của trời), không nhân lượng sáng chiếu xuống mặt nước. Lúc hoàng hôn irradiance thấp → phản chiếu ≈ 0 → đen ở góc nhìn sát mặt nước.
- Lead đã thử `uSkyHorizon = skyHorizon × (sea ? 0.5 : 0.4)`: dải suối ven biển thành màu nước phản chiếu trời chiều (đúng ý), nhưng 5 test fail vì các tiêu chí cũ dựa trên giả định sai ở trên.

### Việc

1. Phản chiếu trời = `skyHorizon × k` (không nhân irradiance), k khoảng 0,3–0,5; có thể giảm k ở rừng bình minh (tán che trời) theo `forestAtmosphereWeight` hoặc tham số grade sẵn có.
2. Cập nhật tiêu chí test cho đúng vật lý, ghi lý do trong comment:
   - Suối rừng t = 0,15: luma ≤ đất bờ × **2,0** ở góc nhìn người đi bộ (1,7 m, nhìn xa 10–30 m); ở góc nhìn thẳng xuống ≤ đất × 1,3.
   - "No unlit emission": khi grade không có nắng **và** trời tối (skyHorizon ≈ 0) thì nước ≈ 0; không còn yêu cầu = 0 khi trời sáng.
   - Bờ suối sáng hơn lòng suối: giữ, có thể so ở góc nhìn thẳng xuống.
3. Suối ven biển t = 0,86, góc nhìn trên đường: luma trong khoảng 0,5–1,1 × luma mặt đường cùng khoảng cách (không đen, không phát sáng).
4. Giữ: biển t = 0,93 luma ≤ 0,35, R/B, vệt ≤ 40 m.
5. `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` exit 0.
