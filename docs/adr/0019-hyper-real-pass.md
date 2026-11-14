# ADR 0019: Đợt nâng cấp siêu thực (HR)

- Trạng thái: **Accepted** (2026-11-14) về hướng; **trần dung lượng chờ Duy** (Q-48).
- Bối cảnh: Duy chấm đồ họa main `c8531eb` 4/10 ("vẫn ở mức khung, chưa đủ thật"), yêu cầu siêu thực: cây không giống nhau, cành chằng chịt, dây leo, suối có đá sỏi/rêu/rong, chim bay hót, sửa các lỗi Lead đề xuất (vách vuông, mép suối răng cưa, biển tối, bảng Roots, mảng xanh trên đường).

## Quyết định
- Giữ ADR 0018 (hướng C) và nâng mức chi tiết lên siêu thực theo `docs/tickets/HR-common.md`: asset CC0 thật hoặc tạo trong Blender, đa dạng theo seed, hệ sinh thái (cây, tầng dưới tán, lòng suối, chim, âm).
- Ticket: HR-TREE1/2, HR-STREAMBED, HR-BIRDS, HR-CLIFF, HR-SEA, HR-ROOTS-SIGN, HR-LIGHT, cùng FIX-PATCH, STREAM-C, MS-C2 đang chạy.
- Giữ: thời gian tới lúc chơi được ≤ 10 s; CPU ≤ main +10 ms/s mỗi ticket; Low giữ T08 Iris Xe; mọi asset HR nạp deferred.
- **Mở:** tổng world ≤ 30 MB (ADR 0015) hạn chế siêu thực. Lead đề xuất (Q-48): High tải thêm gói "HR" deferred tới **tổng 60 MB**, Balanced ≤ 40 MB, Low giữ ≤ 30 MB. Trong lúc chờ, mọi ticket làm trong 30 MB.
