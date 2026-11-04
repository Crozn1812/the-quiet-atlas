## TICKET B2-005 — Loang mép màu nước + nét mực (Balanced/High) trong paper pass

- Trạng thái: Assigned → Codex, đợt 15b, nhánh `lane/B2-005`
- Đọc trước: `docs/tickets/_common-b2.md`; `src/features/world/post/paper.ts` (B2-002 + B2-003)
- Spec: §7.4, §8 (Low ≥ 30 FPS Iris Xe; Low không có pass này); ADR 0013 mục 5 ("Outline mực chỉ ở Balanced/High nếu đo đủ ngân sách"); taste brief §5.4 ("viền loang màu nước ở hậu kỳ — phải rẻ trên Iris Xe")
- Việc: mở rộng `paper.ts`, **không thêm pass** (cùng full-screen pass):
  1. Phát hiện mép bằng depth (4 mẫu chữ thập, so sánh viewZ tuyến tính, ngưỡng tương đối theo khoảng cách) — **tối đa 4 lần đọc depth thêm**.
  2. **Loang màu nước** (Balanced + High): tại mép, đẩy màu nhẹ về phía sẫm hơn của hai bên + làm sáng ra màu giấy một dải mảnh (kiểu "pigment pooling" ở rìa vệt màu), biên độ nhỏ; nhiễu `fibers` (đã có) làm mép không thẳng.
  3. **Nét mực** (chỉ High, define `INK_OUTLINE`): nét `PALETTE.ink` alpha ≤ 0,35, mảnh 1 px vật lý, mờ dần theo khoảng cách (> 40 m không vẽ), không vẽ ở bầu trời.
  4. `setEdges({ bleed?: number; ink?: boolean })`; mặc định bleed 0,5 (Balanced/High), ink = true chỉ khi High.
- Được sửa: `src/features/world/post/paper.ts` (+ file GLSL cùng thư mục), `tests/unit/world/paper.test.ts`
- Test: Low vẫn 0 target; Balanced không có define `INK_OUTLINE`, High có; số lệnh `texture2D(tDepth` trong shader ≤ 5; `setEdges` cập nhật uniform; dispose không đổi.
