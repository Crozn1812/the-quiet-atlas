## TICKET B2-015 — Xe GD110: mô hình điều khiển arcade (logic thuần, chưa render)

- Trạng thái: Assigned → Codex, đợt 15, nhánh `lane/B2-015`
- Đọc trước: `docs/tickets/_common-b2.md`
- Spec: §2 (Manual/Auto Cruise; E lên/xuống xe), §7.5 (arcade có giới hạn, không mô phỏng cơ học; chạy trong hành lang spline; manual và cruise cùng hệ collider; E xuống xe chỉ khi có chỗ đứng an toàn; cruise chậm/dừng trước vật cản; Esc, phím C, mở UI hoặc mất focus hủy cruise ngay), §6.2 (không lưu tiến trình)
- Việc: `src/features/vehicle/` (thư mục mới) — không DOM, không three.js render, không Rapier (Lead nối collider sau):
  1. `model.ts`: state `{ mode: "walk" | "ride", cruise: boolean, s: number /* mét dọc hành lang */, lateral: number /* lệch ngang, m */, speed: number, heading }`; action `step(dt, input)`, `mount`, `dismount`, `toggleCruise`, `cancelCruise(reason)`.
  2. Hành lang là **interface** truyền vào: `{ length: number; halfWidthAt(s): number; pointAt(s): {x,z}; tangentAt(s): {x,z} }` — không import layout của ticket khác; test dùng hành lang thẳng + hành lang cong giả.
  3. Manual: W tăng tốc, S phanh/lùi chậm, A/D lái thay đổi `lateral` (kẹp trong `halfWidthAt(s)` trừ biên 0,5 m — không bao giờ ra khỏi hành lang); tốc độ tối đa 8 m/s, lùi tối đa 1,5 m/s, gia tốc/phanh mượt (hằng số đặt tên rõ).
  4. Cruise: giữ 5 m/s theo tangent; nhận `obstacleAhead(distance)` từ input: < 6 m giảm dần, < 2 m dừng hẳn. Hủy cruise khi: Esc, C, `uiOpen`, `blur`, hoặc người xem nhấn S. Phím W khi đang cruise không hủy.
  5. Mount: chỉ khi `mode=walk` và khoảng cách tới xe ≤ 2 m (đầu vào). Dismount: chỉ khi `speed < 0,5` và `safeGround === true` (đầu vào từ physics); nếu không an toàn trả lý do `"unsafe-ground" | "moving"` để UI báo nhẹ.
  6. `labels.ts`: gợi ý EN/VI ngắn ("E — Ride" / "E — Lên xe", "E — Get off" / "E — Xuống xe", "C — Cruise" / "C — Tự chạy").
- Được sửa: `src/features/vehicle/**`, `tests/unit/vehicle/model.test.ts`
- Test: không vượt tốc tối đa; lateral luôn trong hành lang (fuzz 1 000 bước ngẫu nhiên có seed); cruise dừng trước vật cản < 2 m; mỗi lý do hủy cruise đều hủy ngay; dismount bị chặn khi đang chạy hoặc đất không an toàn; mount xa > 2 m bị từ chối; source không chứa `localStorage`/`sessionStorage`/`document.cookie`.
