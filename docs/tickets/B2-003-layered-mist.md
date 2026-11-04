## TICKET B2-003 — Sương phân lớp theo độ sâu và độ cao (kiểu sơn thủy) trong paper pass

- Trạng thái: Assigned → Codex, đợt 15, nhánh `lane/B2-003`
- Đọc trước: `docs/tickets/_common-b2.md`; code hiện có `src/features/world/post/paper.ts` (B2-002, đã merge)
- Spec: §7.1 (fog thống nhất, vùng chuyển tiếp), §7.4 (Low tắt hậu kỳ); taste brief §5.2, §5.4 ("sương phân lớp theo độ sâu như dãy núi trong tranh sơn thủy; xa thì nhạt dần về màu giấy")
- Việc: mở rộng `paper.ts` (chỉ Balanced/High; Low giữ nguyên 0 pass phụ):
  1. Dựng lại vị trí world từ depth (cần `cameraProjectionMatrixInverse` + `cameraMatrixWorld` uniform).
  2. Ngoài fog tuyến tính hiện có, thêm **3 dải sương** theo khoảng cách (ví dụ 20 / 35 / 55 m): mỗi dải là một bậc trộn về màu sương `PALETTE.mist` rồi `PALETTE.paper` ở xa — chuyển bậc mềm (smoothstep hẹp) để ra cảm giác "các lớp núi" thay vì gradient trơn.
  3. **Sương thấp theo độ cao**: dưới cao độ `mistHeight` (mặc định 1,2 m trên mặt nước, uniform) đặc hơn, mỏng dần lên trên — đọng ở thung lũng suối.
  4. Tham số public qua `setMist({ bands?: [number, number, number]; height?: number; strength?: number })`; giá trị mặc định là hằng số đặt tên rõ.
  5. High: thêm biến thiên ngang rất nhẹ cho mép sương (noise tĩnh, không animate). Balanced: không.
  6. Cường độ tổng không làm chữ/biển chỉ đường gần (< 8 m) bị mờ: trộn = 0 khi khoảng cách < 8 m.
- Được sửa: `src/features/world/post/paper.ts` (+ file GLSL cùng thư mục), `tests/unit/world/paper.test.ts`
- Test: uniform mới tồn tại với giá trị mặc định; `setMist` cập nhật uniform; Low vẫn 0 render target; shader High khác Balanced đúng một define (`MIST_EDGE_NOISE`); dải sương tăng dần; dispose không đổi.
