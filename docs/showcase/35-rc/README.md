# Showcase 35 — ứng viên RC để Duy test

[Hướng dẫn chạy bản local và test 20–30 phút](../../playtest/rc-guide.md) · [Audit: kết quả, lỗi và giới hạn](audit.md) · [Checklist giữ / sửa / bỏ](checklist.md).

**RC đã kiểm, sẵn sàng để Duy test local clone:** `bbd85a7c336aa025f11f42d40a07ea8bdbea83f1`. **PASS:** build, strict gate 1759/1759 unit, full e2e 153/153 với 4 worker, tải lạnh worst 4,653 s /3D 2.128.915 B, Lighthouse 15 lượt, CV, tài nguyên, CPU và duyệt render. CPU delta Script/Task tối đa +3,5/+5 ms/s; harness gốc không đổi. [Kết quả, log và lịch sử FAIL](audit.md#gate-trước-khi-chốt).

Bản RC ở `D:/tqa-worktrees/RC-01`, nhánh `lane/RC-01`. Main chưa merge vì `.git` repo chính chỉ đọc; Claude-Lead sẽ fetch/duyệt/merge clone theo handoff. Chưa push. [Chạy bản local cổng 4180 và lộ trình test](../../playtest/rc-guide.md).

Nguồn trước `ccd9145` có build/strict gate 1755/1755 PASS. `4d627b1` có full e2e 153/153, 4 worker, 3,3 phút, exit 0 khi dùng server ngoài; lượt đầu treo teardown được giữ riêng. Kết quả nguồn cũ không tự chuyển thành PASS cho RC-22.

- [8 khu High, overlay VI/EN và camera 8 góc mỗi khu](audit.md#8-khu-và-camera-r1).
- Welcome RC cuối: [desktop VI](front-bbd85a7/vi-desktop-welcome.png), [EN](front-bbd85a7/en-desktop-welcome.png), [mobile 390 VI](front-bbd85a7/vi-mobile-390-welcome.png), [mobile 320 EN](front-bbd85a7/en-mobile-320-welcome.png). Art/QA đã mở đủ 12 ảnh Welcome/Quick VI/EN desktop/mobile; [gallery và giới hạn viewport](audit.md#welcome-quick-và-mobile-trên-rc-cuối).
- Intro High cuối `bbd85a7`: [1,5 s](visual-bbd85a7/intro-01500.png), [4 s](visual-bbd85a7/intro-04000.png), [7 s](visual-bbd85a7/intro-07000.png), [10 s](visual-bbd85a7/intro-10000.png), [18 s](visual-bbd85a7/intro-18000.png), [sau intro](visual-bbd85a7/intro-after.png). Lead mở từng ảnh; trả điều khiển khoảng 22 s. [Capture 15 ảnh intro/ending](visual-bbd85a7/results.json) PASS, tất cả High, 0 lỗi JavaScript. [Skip thật](ui-audit/vi-intro-skip-real.webp), [màn tải](ui-audit/vi-loading-full.webp) từ lượt UI trước; [bộ `ccd9145`](visual-ccd9145/) giữ riêng.
- [Atlas](ui-audit/vi-journal.webp), [Menu](ui-audit/vi-menu-quality-high.webp), [GD110](ui-audit/vi-bike-cruise.webp), [tựa lan can](ui-audit/vi-railing-real-key-approach.webp).
- Cảnh kết cuối `bbd85a7`: [0,5 s](visual-bbd85a7/ending-00500.png), [26 s](visual-bbd85a7/ending-26000.png), [sau kết](visual-bbd85a7/ending-after.png). Lead mở đủ 9 ảnh ending; hết cạnh tam giác biển rõ, actor ngoài ghế và HUD không chồng chip E. [Ảnh lỗi cũ](ui-audit/vi-ending-1794239751028.webp), [bộ `ccd9145`](visual-ccd9145/) và [bộ nguồn `3bdbd0c`](ending-source-final/) giữ riêng; HUD bộ `3bdbd0c` có trước RC-20.
- [Gợi ý mascot VI/EN ở 1600/1366 px](hint-final/results.json): 4/4 PASS, không chồng chip E, tương phản 11,7448:1 trên `4d627b1`.
- Quick RC cuối: [VI](front-bbd85a7/vi-desktop-quick.png), [EN](front-bbd85a7/en-desktop-quick.png), [mobile 390 VI](front-bbd85a7/vi-mobile-390-quick.png), [mobile 320 EN](front-bbd85a7/en-mobile-320-quick.png). [CV checker cuối](checks/cv-bbd85a7.txt); [CV UI](ui-audit/vi-cv-links.webp) và [case study](ui-audit/en-case-study-1.webp) thuộc lượt audit trước.
- [140 bước audit VI/EN](ui-audit/steps.md), [tuyến đi bộ thật 367,91 s / 0 kẹt](journey/journey.md), [hướng dẫn đo Iris Xe](../../runbook/t08-iris-xe.md).

[Video xem nhanh khoảng 45 giây](rc-preview-bbd85a7.webm): slideshow từ ảnh QA đã chụp, **không phải video gameplay**. Dùng canvas captureStream + Edge MediaRecorder vì ffmpeg không có sẵn; [metadata và nguồn từng slide](checks/video.json). Slide overlay/Atlas/GD110 thuộc lượt audit `d761a62`, các ảnh mới có nguồn `bbd85a7`.

T08/T09 Iris Xe: **NOT RUN**; T10 và điểm cảm nhận: **DEFERRED** cho Duy. Điểm thô P3 còn lại gồm tên Welcome 390 px xuống dòng cuối chỉ “Duy” và email footer mobile bị rút gọn; không che CTA hay overflow.

## Định dạng bằng chứng

370 ảnh PNG trong `ui-audit/`, `ui-audit-first/`, `postcards/` và `welcome/` được chuyển sang WebP quality 90, giữ nguyên kích thước: 199.093.578 B → 32.707.158 B. Đây là bản nén có mất dữ liệu để xem hình; phép đo màu hoặc so pixel phải dùng ảnh gốc. PNG gốc giữ nguyên byte tại `coverage/rc-raw-screenshots/`, kèm manifest SHA-256; thư mục coverage không nằm trong commit. Metadata audit chỉ đổi tên ảnh, giữ nguyên trạng thái, hash và số đo. Các thư mục before, camera, sea-diagnostic và ending-final giữ nguyên.
