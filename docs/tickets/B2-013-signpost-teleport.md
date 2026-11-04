## TICKET B2-013 — Biển chỉ đường dịch chuyển: mô hình + hợp đồng sự kiện

- Trạng thái: Assigned → Codex, đợt 15, nhánh `lane/B2-013`
- Đọc trước: `docs/tickets/_common-b2.md`; `docs/adr/0008-ui-world-event-contract.md`; `src/features/world/layout/zones.ts` (B2-010)
- Spec: §7.2 (tại một bảng, chọn khu đích; sương chuyển cảnh; nhân vật xuất hiện cạnh bảng của khu đó; chỉ khu có bảng mới dịch chuyển được; secrets không có; reduced motion dùng fade ngắn), §2.1 (không icon lớn phủ lên world), §6.2
- Việc: `src/features/navigation/` (logic thuần, không DOM):
  1. `signposts.ts`: một bảng cho mỗi khu trong 8 khu (vị trí lệch khỏi neo khu 3 m về phía đường đi, lấy từ `ZONES`), `arrivalPoint(zoneId)` — điểm đứng an toàn cạnh bảng, nhìn về khu.
  2. `teleport.ts`: máy trạng thái `idle → choosing → fadingOut → moving → fadingIn → idle`; `startChoosing(fromZone)`, `choose(toZone)`, `tick(dt)`, `cancel()`. Thời lượng: mist 0,6 s ra + 0,6 s vào; `reducedMotion` → fade 0,15 s mỗi chiều. Chọn chính khu đang đứng → không làm gì. Không thể chọn secret (kiểu không cho phép).
  3. Hợp đồng sự kiện mới **đề xuất** (không sửa ADR): `tqa:teleport-start { from, to }`, `tqa:teleport-end { to }` — xuất hằng tên sự kiện + type detail trong `events.ts`; ghi trong bàn giao để Lead bổ sung ADR 0008.
  4. Trong lúc teleport: báo `inputLocked = true` để world bỏ qua WASD; khi xong trả `{ position, yaw }` cho world đặt nhân vật.
- Được sửa: `src/features/navigation/**`, `tests/unit/navigation/teleport.test.ts`
- Test: 8 bảng; arrivalPoint khác neo ≥ 2 m; chuỗi trạng thái đúng thứ tự với dt nhỏ và dt lớn (1 s nhảy qua nhiều pha); reduced motion ngắn hơn; cancel trong choosing về idle, trong fading không cho cancel giữa chừng (hoàn tất an toàn); inputLocked đúng từng pha.
