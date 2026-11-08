# FL-01 — làm lại một khu mẫu First Light

Duy chưa nghiệm thu hình ảnh/UX/UI của đợt 31 dù các gate kỹ thuật đạt. Yêu cầu mới: làm lại **một khu trước**, Duy đánh giá rồi mới mở rộng các tác nhân song song.

## Phạm vi và mục tiêu

- Khu mẫu: The First Light, vùng vào world đầu tiên.
- Hướng thử: hình khối cách điệu có chủ đích, bố cục như tiểu cảnh; lấy cảm hứng chiều sâu/mật độ/nắng của ảnh rừng Duy gửi, không dùng pixel của ảnh tham chiếu.
- Cây có thân/cành và tán nhiều cụm với viền rõ; bỏ cảm giác tán hình hộp phẳng ở riêng vùng mẫu.
- Tạo lớp gần/giữa/xa, lối đi đọc được và một điểm tập trung quanh nơi chào; không rải đồ vật đều khắp cảnh.
- Tương tác, camera chơi, xe và lối đi vẫn hoạt động; 7 khu khác giữ nguyên.
- Chỉ được thay `public/zones/first-light.webp` trên nhánh mẫu sau khi chọn góc, giữ ≤60 KB và cập nhật license, để overlay thật khớp cảnh mới. Không thay 7 ảnh khu khác hoặc hero Welcome toàn site.

## Quy trình

Worktree `D:/tqa-worktrees/FirstLight-R1`, nhánh `lane/FirstLight-R1`, từ main `e925812`. Một người thi công; chưa mở rộng các worker song song. Không merge mẫu lên main trước khi Duy duyệt gu.

Chụp trong engine: ảnh camera chơi, ảnh ngang thấp, ảnh tổng thể trên cao, ảnh khi mở nội dung; Balanced và High. Mở xem ảnh và sửa lại nếu mới chỉ là thay đổi nhỏ, chưa có bố cục tốt. Bằng chứng trước/sau đặt ở showcase riêng của khu mẫu. Không lấy test PASS thay cho nghiệm thu thẩm mỹ.

## Ràng buộc kỹ thuật

Theo ADR 0014 và ngân sách hiện có, không nâng trần. Asset tự sinh/nguồn sẵn trong dự án, không dependency mới, không thương hiệu, không lưu tiến trình, không cloud/push/credential. Thay đổi shared scatter nếu có phải giới hạn không gian quanh First Light và kiểm tra hồi quy đủ 8 khu.

## Trạng thái

- Trạng thái: **review / awaiting Duy gu**. Prototype một khu sẵn để đánh giá, chỉ nằm trên nhánh riêng. Source đã kiểm chứng: `56d29d5c9fae057fa332ffe5e1161a5648854faa`; chưa merge main.
- Kiểm tra: full unit 1703/1703 PASS + compose mở rộng 13/13 PASS; lint/typecheck/build PASS; render Low/Balanced/High không lỗi shader; hồi quy 7 khu max |luma delta| 0.001155 < 0.03; coldload EN 5.34 s / VI 5.38 s PASS. CPU hai cặp gốc FAIL: Workshop +12 ms/s vượt +10. Đúng một cặp xác nhận đảo thứ tự không tái hiện miss (+6), aggregate ba cặp Script +10 / Task +10.33 ms/s; CPU vẫn chưa dứt điểm, không gọi PASS/release-ready. Xem báo cáo và đủ raw logs. Full151 E2E/LHCI chưa chạy cho prototype; Iris Xe/T10 vẫn pending đúng runbook.
- Nghiệm thu gu: chưa được Duy duyệt.

- Gallery và báo cáo: [32-first-light-prototype](../showcase/32-first-light-prototype/README.md). Không merge main/push; không mở rộng các khu trước Duy duyệt.
- Checkpoint quota trước báo reset thực 7:28PM; tiếp tục 19:42 Việt Nam 08/11, sau reset 19:28. Không suy đoán PASS từ phiên cũ.
