## HR-AUDIT — chuyển slot (lỗi EPERM)

Lượt trước chạy trong slot W-D: sandbox của account này không có quyền ghi ở đó, nên bị EPERM ở `.next/` và `test-results/`. Giờ chạy trong slot W-C, nơi account này đã từng build được. Script `tools/review/hr-audit.mjs`, `hr-audit-layout.mjs` (kế hoạch 52 ảnh) và báo cáo nháp `tests/review/HR-AUDIT.md` đã chép sẵn vào đây. **Làm tiếp:** build 1 lần, serve trên **cổng 4203** (slot C), chụp đủ ảnh, ghi bảng lỗi và FPS. Không làm lại script từ đầu.
