## TICKET B2-011 — Terrain theo suối, chia ô streaming (dữ liệu heightfield, chưa render)

- Trạng thái: Assigned → Codex, đợt 15, nhánh `lane/B2-011`
- Đọc trước: `docs/tickets/_common-b2.md`; `src/features/world/layout/` (B2-010), `src/features/world/terrain.ts` (heightfield hiện có, Rapier column-major `z + x * stride`)
- Spec: §7.1 (chia vùng tải theo khoảng cách, một thế giới liền mạch; Low không đổi collider), §7.4 (collider heightfield sinh từ cùng heightmap với mesh), §8 (≤ 30 MB world)
- Việc: `src/features/world/terrain/` (thư mục mới; **không sửa** `terrain.ts` cũ):
  1. `height.ts`: `worldHeight(x, z)` thuần, tất định: lòng suối hạ thấp theo khoảng cách tới spline suối (`riverPointAt`, tính khoảng cách gần đúng bằng bảng mẫu tra sẵn), bờ thoải, đồi hai bên tăng dần theo khoảng cách (noise thủ tục có seed, biên độ vừa), đường đi bộ (`pathPointAt`) được làm phẳng rộng 3 m và dốc ≤ 20 % dọc tuyến, cuối tuyến (biome coast) hạ dần về bãi biển và mặt biển y = 0.
  2. `tiles.ts`: chia world thành ô 64 × 64 m, lưới 33 × 33 đỉnh (2 m/ô); `tileKey(ix, iz)`, `tilesAlongPath(radiusM)` → danh sách ô cần có cho tuyến; `buildTile(ix, iz)` → `{ heights: Float32Array (column-major như Rapier), size, cells, origin }`. Mép ô chung đỉnh trùng giá trị (không nứt).
  3. `streaming.ts`: `tilesToLoad(playerT, aheadM = 120, behindM = 60)` theo khoảng cách dọc path; `tilesToUnload(...)`. Không tải gì thật — chỉ tính tập ô.
  4. Ghi số liệu trong bàn giao: tổng số ô dọc tuyến, byte heightfield/ô (Float32) — dữ liệu sinh ở client nên 0 byte tải, chỉ RAM.
- Được sửa: `src/features/world/terrain/**`, `tests/unit/world/river-terrain.test.ts`
- Test: tất định (gọi 2 lần cùng kết quả); mép ô liền kề trùng độ cao; trên đường đi dốc ≤ 20 % tại 500 mẫu; tâm suối thấp hơn bờ hai bên ≥ 0,6 m tại 100 mẫu (trừ đoạn biển); khu Last Postcard gần mực biển; `tilesToLoad` luôn chứa ô dưới chân người chơi; số ô dọc tuyến hợp lý (in ra).
