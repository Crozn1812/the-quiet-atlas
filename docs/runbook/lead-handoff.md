# Bàn giao UX/UI — 2026-11-08

Duy giao Codex nhận UX/UI còn lại và báo cáo gộp cuối đợt. Ban đầu chạy subagent tuần tự; cập nhật tiếp theo yêu cầu khoảng 5 tác nhân mỗi đợt. Hệ thống hiện cho tối đa 3 subagent đồng thời với root, nên chia 5 vai và xếp theo giới hạn này. Các phép đo GPU/e2e/perf vẫn chạy riêng để tránh nhiễu. Ủy quyền này áp dụng cho đợt UX/UI; không cần chờ ngưỡng usage 95% để thực hiện các ticket này.

## Trình tự thực hiện

1. U-02: hoàn thiện ảnh bưu thiếp 8 khu, overlay tạp chí, kiểm tra mobile và nút Đóng. Đã tích hợp trong `b961662`.
2. U-03: Welcome, CTA, ảnh biển mới và reflow. Đã tích hợp trong `a8900c2`.
3. QA: chạy gate, full e2e, load-budget, Lighthouse và rà các bảng Menu/Sổ Atlas/Đi tới…/Quick trên bản tích hợp.

Các hash `b961662`/`a8900c2` và worktree `UX-final` ở trên là lịch sử tích hợp, không phải worktree đang chạy. Đợt UI đã squash-merge vào main `f20147d`; sửa pause và locator tiếp tục merge tại `7774ae8`. Hai worktree tích hợp đã được gỡ sau gate. Không khởi động lại worker cũ U-02/U-03.

Năm vai kiểm tra cuối đã hoàn tất: tài nguyên/markup, full e2e, đối chiếu báo cáo, load-budget, Lighthouse. Tài nguyên và báo cáo chỉ đọc chạy cùng lúc; ba phép kiểm trình duyệt nặng chạy lần lượt. Main `7774ae8`: strict gate 1697/1697 unit, full e2e 151/151, 3 tải lạnh mỗi locale EN/VI và 15 lượt Lighthouse đều PASS. Không khởi động lại phép kiểm hoặc ticket đã hoàn tất khi không có thay đổi mới.

Kết quả cuối và bằng chứng: `docs/showcase/31-ux-final/checklist.md` và cập nhật mới nhất ở `docs/PROJECT_STATUS.md`.

Giữ nguyên: không push nếu chưa được Duy đồng ý từng lần; không chạm cloud/credential; không ghi PASS khi chưa chạy. T10/playtest do người thật và T08/T09 trên Iris Xe chưa được thay thế bằng QA trên máy dev.
