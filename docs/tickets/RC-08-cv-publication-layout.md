## RC-08 — CV không công bố placeholder, ngắt trang dễ đọc

- Trạng thái: doing; Lead thi công.
- Vùng: tools/cv/render.mjs, tests/unit/tools-cv/render.test.ts.
- Phát hiện qua PNG PDF thật: tiêu đề Dự án đứng lẻ cuối trang 1; bản EN 4 trang nhiều khoảng trống do cả article không được tách. Repository TBD và câu phân chia công việc chưa đủ xuất hiện công khai.
- Sửa: chỉ bỏ câu chứa TBD, giữ nguyên câu đã xác nhận; không hiển thị repository khi chưa có. Không sửa src/content, không thêm thành tích. Giữ disclaimer demo/Lab và thiếu phép đo thực tế.
- Print style riêng CV: 10.5pt, bỏ padding trùng margin A4, h2/h3 đi cùng đoạn sau, cho article tách trang với widows/orphans 3.
- Phép thử: tools-cv unit; sinh PDF, metadata/text verifier; render từng trang PNG và mở xem; HTTP tải PDF bằng RC audit/check:cv. Không dùng text extraction thay duyệt layout.
