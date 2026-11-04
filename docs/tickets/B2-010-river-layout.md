## TICKET B2-010 — Layout 8 khu dọc suối uốn chữ S + đo tuyến 5–7 phút

- Trạng thái: Assigned → Codex, đợt 15, nhánh `lane/B2-010`
- Đọc trước: `docs/tickets/_common-b2.md`
- Spec: §2.1 (8 khu, suối là trục chính), §7.1 (5–7 phút đi bộ; Workshop ≤ 45–60 s từ spawn; Roots, Milestones ≤ 90 s; Horizon + Quiet Shore cuối; Last Postcard ở bờ biển), §7.5 (xe chạy trong hành lang spline); taste brief §5.2 (suối là dải lụa uốn chữ S)
- Việc: `src/features/world/layout/` — chỉ **dữ liệu + toán**, không render:
  1. `river.ts`: spline suối (x, z; y = 0) bằng `CatmullRomCurve3`, từ rừng (spawn) ra biển, uốn **chữ S rõ** (≥ 3 khúc cua đổi chiều). Điểm điều khiển là hằng số; `riverPointAt(t)`, `riverTangentAt(t)`, `riverLength()`.
  2. `path.ts`: đường đi bộ chính song song suối, lệch 6–10 m, đổi bờ tối đa 2 lần (qua cầu); `pathPointAt(t)`, `pathLength()`; danh sách vị trí cầu.
  3. `zones.ts`: 8 khu dùng `ZONE_IDS` từ `src/features/interaction/targets.ts` (không định nghĩa lại). Mỗi khu: `t` trên path, vị trí neo, bán kính, hướng nhìn gợi ý, `biome` ("forest-dawn" | "hill" | "coast-dusk"). Thứ tự: First Light (t = 0, spawn) → Workshop → Roots → Milestones → Old Trail → Horizon → Quiet Shore → Last Postcard (bờ biển, cuối).
  4. `timing.ts`: tốc độ đi bộ lấy từ `src/features/world/locomotion.ts` (3 m/s) — import hằng số nếu có, không thì khai báo và ghi lý do; `secondsToZone(id)`, `routeSeconds()`.
  5. `lighting.ts`: `timeOfDayAt(t)` 0 (bình minh) → 1 (hoàng hôn) theo vị trí, mượt, có đoạn chuyển tiếp (§7.1).
  6. `tools/world/route-time.mjs`: in bảng khu / mét / giây. Node không chạy TS trực tiếp → chọn cách đơn giản nhất (ví dụ test ghi `test-results/route-time.json` rồi script đọc) và ghi trong bàn giao.
- Được sửa: `src/features/world/layout/**`, `tests/unit/world/layout.test.ts`, `tools/world/route-time.mjs`
- Test (gate §7.1 ở mức thiết kế): tổng tuyến 300–420 s; Workshop ≤ 60 s; Roots và Milestones ≤ 90 s; Horizon, Quiet Shore, Last Postcard là 3 khu cuối; các khu cách nhau ≥ 25 m; path cách tâm suối ≥ 4 m trừ đoạn cầu; độ cong suối đổi dấu ≥ 3 lần; timeOfDay đơn điệu không giảm.
