## TICKET B2-016 — Mesh + collider cho ô terrain (render ô từ B2-011)

- Trạng thái: Assigned → Codex, đợt 15b, nhánh `lane/B2-016`
- Đọc trước: `docs/tickets/_common-b2.md`; `src/features/world/terrain/tiles.ts` (B2-011); `src/features/world/materials/ramp.ts` (B2-004); `src/features/world/rapier.ts` (cách tạo heightfield hiện có)
- Spec: §7.4 (collider heightfield cùng heightmap với mesh), §7.1 (Low không đổi collider), §8
- Việc: `src/features/world/terrain/mesh.ts` + `collider.ts`:
  1. `createTileMesh(tile, material)` → `Mesh` dùng chung `material` (truyền vào, một material cho mọi ô), BufferGeometry index Uint16, normal tính từ heightfield **có tính ô lân cận** (dùng `worldHeight` ở mép để normal liền mạch, không thấy đường nối ô).
  2. Màu đỉnh (vertex color) nhẹ theo độ cao/độ dốc/biome: thấp gần suối hơi `forestDeep`, đồi `forestLight`, bãi biển pha `paper` + `dusk` — nhân với màu material (material bật `vertexColors`).
  3. `createTileCollider(RAPIER, world, tile)` → heightfield collider đúng vị trí ô (scale, origin) và `removeTileCollider`.
  4. `createTilePool()` quản lý tạo/hủy theo `tilesToLoad`/`tilesToUnload`, dispose geometry khi tháo, tái dùng không leak.
- Được sửa: `src/features/world/terrain/mesh.ts`, `src/features/world/terrain/collider.ts`, `src/features/world/terrain/pool.ts`, `tests/unit/world/terrain-mesh.test.ts`
- Test: số đỉnh/tam giác đúng 33×33 / 2048; vị trí đỉnh mép hai ô kề nhau trùng; normal mép hai ô khớp (sai lệch < 1e-3); pool tạo/tháo không giữ geometry đã dispose; collider dùng cùng mảng heights (mock RAPIER).
