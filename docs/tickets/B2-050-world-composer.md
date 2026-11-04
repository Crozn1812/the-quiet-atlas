## TICKET B2-050 — Ghép thế giới thật: terrain streaming + cây + nước + trời thay cảnh thử 60 × 60 m

- Trạng thái: Assigned → Codex, đợt 15c, nhánh `lane/B2-050`
- Đọc trước: `docs/tickets/_common-b2.md` — **ngoại lệ: ticket này ĐƯỢC sửa `src/features/world/index.ts`**; `src/features/world/README.md`; các module: `terrain/{tiles,streaming,mesh,collider,pool,height}.ts`, `foliage/`, `water/`, `sky/`, `layout/`, `post/paper.ts`, `rapier.ts`, `locomotion.ts`
- Spec: §7.1 (một thế giới liền mạch, tải vùng kế tiếp trước khi đến, có fallback; ánh sáng theo vị trí), §7.4 (collider heightfield cùng heightmap; Low không đổi collider/vị trí tương tác; spring arm; mờ tán lá), §8 (time-to-playable ≤ 10 s; FPS Low), §6.2 (không lưu tiến trình); ADR 0008 (giữ nguyên mọi sự kiện/`data-*` hiện có)
- Việc:
  1. `src/features/world/scene/compose.ts`: `createWorldScene({ RAPIER, world, scene, quality })` → `{ update(playerPos, dt), setQuality(q), dispose() }`: dùng tile pool (B2-016) + `tilesToLoad/Unload` theo vị trí người chơi trên path (tìm `t` gần nhất), foliage theo ô (B2-018, collider thân cây cho **mọi** cây ở ô đã tải), nước (B2-017), sky dome + grade follower (B2-019) áp vào sun/hemisphere/fog/paper (`paperColor` giữ nguyên, fog color theo grade).
  2. `rapier.ts`: cho phép truyền heightfield động (thêm API `addCollider/removeCollider` hoặc trả về `world` qua controller) **không** đổi hành vi controller hiện có; Rapier vẫn nạp lazy như cũ.
  3. `index.ts`: thay `createTerrain()/createTrees()` 60 m + ramp thử bằng scene compose; spawn tại khu `first-light` (`ZONES`), giữ bảng chỉ đường/bàn Workshop hiện tại nhưng đặt lại vị trí theo neo khu `first-light` và `workshop` (ZONES). Camera spring arm + mờ tán lá dùng foliage mới (cây gần camera). Return-to-path đưa về điểm an toàn gần nhất trên path.
  4. Không tải file mạng nào mới (mọi thứ thủ tục); chunk world có thể tăng — ghi số byte gzip trước/sau trong bàn giao.
  5. Giữ mọi `data-world-*`, sự kiện, pause, context-loss, dispose (T09) như cũ.
- Được sửa: `src/features/world/index.ts`, `src/features/world/scene/**`, `src/features/world/rapier.ts`, `tests/unit/world/**` (cập nhật test cũ phụ thuộc cảnh 60 m cho đúng hành vi mới, không xóa test hành vi)
- Test: unit toàn bộ PASS; test mới cho compose: ô quanh spawn tải trước frame đầu; đi 300 m dọc path tháo ô sau và tải ô trước; collider cây = 100 % ở mọi quality; dispose giải phóng mọi geometry/material của ô (đếm). Ghi rõ e2e nào có thể bị ảnh hưởng (Lead chạy).
