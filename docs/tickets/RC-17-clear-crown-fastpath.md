## RC-17 — Không duyệt slot của batch tán đã hoàn toàn rõ

- Vùng file: `src/features/world/crown-fade.ts`, `tests/unit/world/foliage-light.test.ts`.
- Trạng thái: review; chưa commit/merge, chưa build hoặc đo CPU.
- Mục tiêu: giảm đọc/ghi Float32 thừa trên các batch không che người chơi, giữ từng mẫu opacity và GPU upload như RC-10/RC-15.
- Sửa: alpha khởi tạo chính xác 1 cho toàn capacity. Theo dõi prefix đang active đã được xác nhận toàn 1 và count lần trước; chỉ return khi prefix rõ, count không đổi, blocked rỗng, dt và hệ số blend hữu hạn. Không dùng epsilon để đoán tán đã hết fade.
- Sau lượt fade bình thường, kiểm giá trị Float32 đã ghi có bằng đúng 1 hay không. Bất kỳ đổi count nào cũng buộc chạy lại loop gốc: slot bị ẩn có thể còn fade và phải hồi phục khi quality thêm nó lại. Count0 không xóa alpha ngoài prefix.
- dt NaN/Infinity và finite negative overflow như -100 tiếp tục phép tính gốc; không dùng fast path để che kết quả NaN của dữ liệu không hợp lệ.
- Test: chuỗi Float32/upload-version đối chiếu công thức gốc qua fade/recover/count0/count giảm rồi tăng, slot ẩn còn fade. Spy chứng minh các frame rỗng ban đầu và sau hồi phục không gọi getX/setX; tăng count phải đọc/ghi lại mọi slot. Nonfinite/overflow đối chiếu kết quả gốc.
- Đã chạy: foliage + foliage-light **26/26 PASS**, Vitest exit0. Lượt đầu 24 PASS/2 FAIL vì thiếu import `vi` trong test mới; đã thêm import rồi chạy lại, không phải lỗi runtime sản phẩm.
- Cần Lead: strict gate, build, CPU hai lượt cô lập mỗi bản, ảnh High tám khu/luma. Chưa kết luận đạt trần +10ms/s; không thay đổi ngưỡng.
