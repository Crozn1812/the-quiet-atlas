## HR-STREAMBED — tiếp tục sau mất điện (Lead)

Máy mất điện khoảng 13:00 ngày 14/11; phiên Codex trước bị cắt giữa chừng. Mọi thay đổi chưa commit của bạn **vẫn còn nguyên** trong worktree này.

Việc: chạy `git status` + `git diff --stat` để xem mình đã làm tới đâu, đọc lại `docs/tickets/HR-STREAMBED-return1.md` (và `docs/tickets/HR-common.md` nếu là ticket HR-*), rồi làm tiếp phần còn thiếu tới điều kiện xong của ticket đó. Tiến trình build/e2e/Blender đang chạy dở đã chết: xóa file tạm hỏng nếu có (vd. `.next`, `out` dở dang) rồi chạy lại. Không làm lại từ đầu những gì đã xong. Không commit.
