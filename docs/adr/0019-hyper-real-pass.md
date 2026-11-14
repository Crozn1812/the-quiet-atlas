# ADR 0019: Đợt nâng cấp siêu thực (HR)

- Trạng thái: **Accepted** (2026-11-14). Duy bỏ mọi trần (Q-48, 14/11 ~11:00): "không có giới hạn gì cả".
- Bối cảnh: Duy chấm đồ họa main `c8531eb` 4/10 ("vẫn ở mức khung, chưa đủ thật"), yêu cầu siêu thực: cây không giống nhau, cành chằng chịt, dây leo, suối có đá sỏi/rêu/rong, chim bay hót, sửa các lỗi Lead đề xuất (vách vuông, mép suối răng cưa, biển tối, bảng Roots, mảng xanh trên đường).

## Quyết định
- Giữ ADR 0018 (hướng C) và nâng mức chi tiết lên siêu thực theo `docs/tickets/HR-common.md`: asset CC0 thật hoặc tạo trong Blender, đa dạng theo seed, hệ sinh thái (cây, tầng dưới tán, lòng suối, chim, âm).
- Ticket: HR-TREE1/2, HR-STREAMBED, HR-BIRDS, HR-CLIFF, HR-SEA, HR-ROOTS-SIGN, HR-LIGHT, cùng FIX-PATCH, STREAM-C, MS-C2 đang chạy.
- ~~Giữ: thời gian tới lúc chơi được ≤ 10 s; CPU ≤ main +10 ms/s; Low giữ T08~~ → không còn là gate (xem cập nhật dưới); vẫn nạp deferred và có đường Low.
- ~~Mở: trần 30 MB~~ → đã bỏ, xem cập nhật dưới.

## Cập nhật 14/11: bỏ trần (Duy)
- Duy: "Mình đã bỏ vấn đề giới hạn mức trần rồi, không có giới hạn gì cả." Thay ADR 0015/0018 về ngân sách: **không còn trần** tổng world MB, byte asset, tam giác, draw call, thời gian tới lúc chơi được, CPU so main.
- Vẫn giữ như **thực hành kỹ thuật** (không phải gate): asset nặng nạp deferred/streaming để trang vẫn mở được; có đường Low cho máy yếu; không tạo việc JS mỗi frame vô ích. Các số đo (byte, thời gian tải, CPU, FPS) vẫn được **ghi lại** trong mỗi bàn giao và PROJECT_STATUS để Duy thấy, nhưng không chặn merge.
- Script gate (`check:assets`, load-budget, ngưỡng CPU) đổi sang **chế độ báo cáo**: in số, không fail vì vượt trần (ticket BUDGET-OFF). Các kiểm tra không phải trần vẫn chặn: license, leaks, 0 chunk 3D trước Enter World, lỗi console, e2e chức năng.
