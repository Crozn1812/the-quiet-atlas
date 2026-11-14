# Duy chấm đồ họa hướng C — bộ cuối

Thời điểm: {{generatedAt}}. Tạo trong {{elapsedSeconds}} giây. Dung lượng: {{totalBytes}} byte / 30.000.000 byte.

Asset: {{assetRequests}} request; {{assetBytes}} byte phản hồi hoàn tất (không gồm tài liệu HTML, gồm các lần tải lại giữa phiên). Request bị hủy: {{cancelledRequests}} (ghi riêng; chuyển khu có thể hủy tải môi trường cũ). Lỗi console/JavaScript: {{consoleErrors}}. Chi tiết từng phiên, góc máy và lỗi tải: `metrics.json`.

Mở `sheet-high.webp` và `sheet-low.webp` để so sánh. Thứ tự từ trái sang phải, từ trên xuống dưới theo bảng. Ảnh khu: `high-<mã>-01/02/03.webp` và `low-<mã>-01.webp`, 1600×900, WebP chất lượng 82. Góc 01 theo ingame-shots; 02/03 lệch trái/phải. Luma 0–1 là trung bình cả ảnh, không phải điểm đánh giá mỹ thuật.

Chọn đúng một ô **giữ / sửa / bỏ** ở mỗi dòng và ghi rõ chi tiết cần chỉnh. Đây là phiếu duyệt thủ công; script chỉ điền số đo.

| Hạng mục (mã) | Luma High / Low góc 01 | Giữ | Sửa | Bỏ | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Ánh sáng đầu tiên (first-light) | {{first-light.high}} / {{first-light.low}} | [ ] | [ ] | [ ] | |
| Xưởng (workshop) | {{workshop.high}} / {{workshop.low}} | [ ] | [ ] | [ ] | |
| Cội rễ (roots) | {{roots.high}} / {{roots.low}} | [ ] | [ ] | [ ] | |
| Cột mốc (milestones) | {{milestones.high}} / {{milestones.low}} | [ ] | [ ] | [ ] | |
| Lối mòn cũ (old-trail) | {{old-trail.high}} / {{old-trail.low}} | [ ] | [ ] | [ ] | |
| Chân trời (horizon) | {{horizon.high}} / {{horizon.low}} | [ ] | [ ] | [ ] | |
| Bờ yên tĩnh (quiet-shore) | {{quiet-shore.high}} / {{quiet-shore.low}} | [ ] | [ ] | [ ] | |
| Tấm bưu thiếp cuối (last-postcard) | {{last-postcard.high}} / {{last-postcard.low}} | [ ] | [ ] | [ ] | |
| Intro (`intro.webm` hoặc 12 khung `intro-*.webp`) | {{intro}} | [ ] | [ ] | [ ] | |
| Ending (`ending.webm` hoặc 12 khung `ending-*.webp`) | {{ending}} | [ ] | [ ] | [ ] | |
| Nhân vật (`character-01/02/03.webp`) | High, 3 góc cận | [ ] | [ ] | [ ] | |
| Xe (`vehicle-01/02/03.webp`) | High, 3 góc cận | [ ] | [ ] | [ ] | |
| Nước | Xem Bờ yên tĩnh và Chân trời | [ ] | [ ] | [ ] | |
| Cây | Xem Ánh sáng đầu tiên và Cội rễ | [ ] | [ ] | [ ] | |
| Ánh sáng | So sánh đủ 8 khu High / Low | [ ] | [ ] | [ ] | |

WebM ghi 15 fps từ canvas, không có âm thanh; mỗi file tối đa 8.000.000 byte, 30–60 giây. Mỗi đoạn luôn kèm 12 ảnh để xem nhanh. Nếu không ghi được video, nguyên nhân nằm trong `metrics.json`.

Người duyệt: ____________________ Ngày: ____________________
