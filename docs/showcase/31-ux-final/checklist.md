# UX/UI — vòng hoàn thiện ngày 08/11/2026

Quy trình thi công: U-02 → U-03 → QA tổng thể. Theo yêu cầu tiếp theo của Duy, vòng kiểm tra cuối chia 5 vai; tối đa 3 subagent cùng lúc, các phép kiểm browser/GPU chạy lần lượt.

## Duy đánh dấu sau khi xem

| Hạng mục | Giữ | Sửa | Bỏ | Ghi chú |
|---|---|---|---|---|
| Welcome desktop: ảnh biển, hành động chính, thẻ góc trái | [ ] | [ ] | [ ] | |
| Welcome mobile: hình ảnh, chữ và nút không bị cắt | [ ] | [ ] | [ ] | |
| Overlay 8 khu: ảnh bưu thiếp, không có HUD | [ ] | [ ] | [ ] | |
| Overlay màn hình hẹp: ảnh và nội dung đọc được | [ ] | [ ] | [ ] | |
| Menu, Sổ Atlas, Đi tới… và Quick Portfolio | [ ] | [ ] | [ ] | |

T10 và playtest người thật vẫn DEFERRED tới khi Duy chấm. Việc kiểm tra tự động không thay thế đánh giá này.

## Bằng chứng đã duyệt bằng mắt

- [Welcome desktop/mobile](welcome-contact.webp): tiếng Việt/Anh, CTA và ảnh biển hiện tại.
- [Ảnh 8 khu](postcards-contact.webp): ảnh engine High, không có HUD hoặc avatar.
- [Overlay desktop](overlays-desktop-contact.webp).
- [Overlay mobile](overlays-mobile-contact.webp): First Light, Workshop, Old Trail, Quiet Shore; nút Đóng bám khi cuộn.
- [Menu, Sổ Atlas, Đi tới… và Quick](ui-contact.webp).

## Phần đã tích hợp

- U-02: ảnh 960×640 cho 8 khu, mỗi ảnh dưới 60.000 byte; bố cục tạp chí, chữ thân tối thiểu 17 px và nút Đóng luôn tiếp cận được.
- U-03: ảnh Welcome mới từ engine hiện tại, High; 57.032 byte cho bản 1920 và 22.232 byte cho bản 960. CTA 52 px; chữ nút chính 16 px và nút phụ 14 px; giữ vị trí thẻ theo ADR 0009.
- Công cụ chụp có camera review chỉ bật khi chủ động opt-in QA. Không tải engine từ content renderer.

Kết quả kiểm tra, hash mã, giới hạn và bằng chứng thô: [qa-final.md](qa-final.md).
