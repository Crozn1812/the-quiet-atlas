## TICKET B2-018 — Rải cây theo ô và biome (instanced, tất định)

- Trạng thái: Assigned → Codex, đợt 15b, nhánh `lane/B2-018`
- Đọc trước: `docs/tickets/_common-b2.md`; `src/features/world/terrain/height.ts`, `tiles.ts`; `src/features/world/layout/` (path, river, zones); `src/features/world/terrain.ts` (cách instancing + density theo quality hiện có)
- Spec: §7.4 (mật độ cây 40/70/100 %; Low không thay collider/vị trí tương tác), §7.1; taste brief §5.4 ("nhiều khoảng trống; con người nhỏ trong khung cảnh lớn"), §5.4 (rừng thông kiểu Đà Lạt, đồi cỏ)
- Việc: `src/features/world/foliage/`:
  1. `scatter.ts`: `scatterTile(tile)` → danh sách cây `{ x, z, y, scale, kind: "pine" | "broadleaf", lean }` bằng Poisson-disk có seed theo `tileKey` (tất định). Mật độ theo biome: forest-dawn dày (nhưng chừa khoảng trống ngẫu nhiên kiểu "khoảng sáng"), hill thưa, coast gần như không. Loại trừ: lòng suối + 3 m, đường đi + 2,5 m, bán kính khu (zones) + 4 m, cầu.
  2. `instances.ts`: `createFoliage(maxPerKind)` dùng 2 InstancedMesh/loại (thân + tán) với geometry placeholder (giữ thông nón như hiện tại; broadleaf = icosahedron thấp poly), material lấy từ `RAMP_PRESETS`; `setTiles(trees[])`, `setQuality(q)` chọn tập con đều (không đổi collider), `dispose()`.
  3. `colliders.ts`: danh sách collider thân cây (trụ r = 0,28 m) cho **mọi** cây, không phụ thuộc quality.
- Được sửa: `src/features/world/foliage/**`, `tests/unit/world/foliage.test.ts`
- Test: tất định; không cây nào trong vùng loại trừ (kiểm 100 % cây của 10 ô dọc tuyến); khoảng cách tối thiểu Poisson tôn trọng; Low = 40 % ± 1 cây số hiển thị, collider = 100 %; coast ≤ 5 % mật độ forest; in ra tổng cây dọc tuyến.
