# ADR 0009 — Shell toàn màn hình và HUD góc

- Trạng thái: **Accepted** (Duy chốt 2026-11-04)
- Spec: §2 (Welcome có Enter World, Quick Portfolio, Sound), §3.1 (quy tắc 30 giây), §3.4, §5 (không tải 3D trước Enter World), §6.4 (menu), §8, §9
- Thay thế phần bố cục của L1-002/L1-005 (khung world 60vh nằm giữa trang kiểu dashboard).

## Bối cảnh

Duy xem bản chạy thử: world hiện là một khung nhỏ chen giữa các khối nội dung. Mong muốn: world chiếm toàn màn hình, thông tin và nút gom gọn ở một góc.

## Quyết định

1. **Trước Enter World** (`/en/`, `/vi/`): một khung toàn màn hình (100 dvw × 100 dvh) với **ảnh nền 2D nhẹ** vẽ bằng CSS/SVG inline (rừng bình minh, không file asset ngoài, không font ngoài). Thẻ thông tin ở **góc dưới trái**: tên, vai trò · cấp độ, một câu giới thiệu, nút **Enter World**, link Quick Portfolio, CV, liên hệ (email), Sound. Đây là nơi đáp ứng quy tắc 30 giây — không cần cuộn.
2. **Bấm Enter World**: 3D tải bằng `import()` (giữ §5 — 0 request 3D trước đó) và **thay ảnh nền tại chỗ**, cùng document, không điều hướng.
3. **Trong world**: thẻ thông tin thu thành **thanh nút tối giản** ở góc dưới trái: Quick Portfolio, CV, liên hệ, Sound, Menu, Thoát world. Nút dạng biểu tượng có tên truy cập (`aria-label` khớp chữ hiển thị trong tooltip/nhãn ẩn), vùng bấm ≥ 24 px. Tên/vai trò không hiện thường trực trong world.
4. Menu world (Esc) giữ nguyên chức năng; nút mở menu chuyển vào thanh HUD; "Back to Welcome" chuyển thành nút **Thoát world** trong HUD (và trong menu).
5. Gợi ý tương tác "E" hiển thị giữa phía dưới màn hình; overlay nội dung giữ kích thước 85–90 %.
6. Không đổi: mobile/không WebGL/viewport < 1024 dùng cùng khung toàn màn hình + thẻ góc, nút đổi thành "Xem bản Editorial"; trang Quick Portfolio và case study không đổi; JS tắt vẫn đọc được thẻ thông tin.
7. Các khối nội dung dài trước đây nằm dưới Welcome (dự án, CV, liên hệ chi tiết) chuyển hẳn sang Quick Portfolio; Welcome chỉ còn một màn hình.

## Đánh đổi

- Ảnh nền 2D không phải ảnh chụp cảnh 3D thật → có thể khác nhẹ với world; chấp nhận để giữ trang đầu ≤ 1 MB và LCP nhanh. Khi có art bible (B2) thay bằng ảnh tối ưu đã có giấy phép.
- Tên/vai trò không thường trực trong world; vẫn mở được qua Quick Portfolio hoặc nội dung The First Light.

## Gate liên quan

T01 (Welcome đủ thông tin), T02 (0 chunk 3D trước Enter World), T11 (bàn phím, tên truy cập, target size), Q18 (ngân sách tải), LCP ≤ 2,5 s.
