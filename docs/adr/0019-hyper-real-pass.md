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

## Cập nhật 15/11: siêu thực cho mọi thứ, kể cả nhân vật (Duy)

- Duy (15/11): "nhân vật làm siêu thực. siêu thực áp dụng cho mọi cái trong dự án." Đây là câu trả lời cho Q-50.
- Áp dụng cho mọi nội dung 3D: nhân vật, xe, sinh vật, đạo cụ, công trình, địa hình, nước, bầu trời. Không còn ngoại lệ "giữ cách điệu". Riêng tượng ở Milestones vốn là tượng sứ, nên "thật" nghĩa là sứ, đá và vết nứt thật.
- Vẫn giữ: không logo, không thương hiệu; tham chiếu chỉ lấy cảm hứng. Khuôn mặt nhân vật là người thật về da, tóc, tỉ lệ, nhưng **không dựng theo ảnh của Duy đến mức nhận diện** (taste.md §5.6). Muốn đổi điểm này phải có quyết định riêng của Duy.
- Giao diện portfolio 2D (Welcome, Quick, case study) không thuộc phạm vi này.

## Cập nhật 16/11: khuôn mặt nhân vật là mặt thật của Duy

Duy chấm mặt nhân vật MakeHuman (HR-CHAR) là "khá đáng sợ" và quyết định: khuôn mặt là đại diện của cả dự án, phải giống mặt Duy, chân thật từng góc cạnh, không còn kiểu siêu thực chung chung. Thay taste.md §5.6 (trước cấm mặt nhận diện được). Duy là chủ chân dung và đồng ý dùng trong asset public (GLB, texture). Ảnh tham chiếu để ở `docs/art-bible/refs/duy-face/` (gitignore, không commit ảnh gốc). Texture sinh từ ảnh của Duy ghi trong LICENSES.csv là ảnh của chủ dự án, có đồng ý. Ticket: HR-FACE.

## Cập nhật 17/11: dừng HR-FACE

HR-FACE qua 3 vòng (Codex C, dựng tay từ 8 ảnh) không ra mặt Duy: vòng 3 da loang, nụ cười như răng giả, tóc như cái bát. Duy chọn demo với mặt MakeHuman hiện có và bỏ việc làm mặt theo ảnh. Không merge HR-FACE. Patch vòng 3 và ảnh so sánh lưu ở `D:/tqa-worktrees/evidence/HR-FACE/` (ngoài repo, có ảnh riêng của Duy). Nếu sau này làm lại, hướng Lead đề xuất là quét 3D đầu (Meshroom, chạy trên máy).
