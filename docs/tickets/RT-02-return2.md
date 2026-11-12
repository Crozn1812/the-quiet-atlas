RT-02 — Lead trả lại vòng 2 (vòng cuối trước khi Lead tự sửa). Ảnh: test-results/rt02-review/lead-r1.webp.

Đã đạt: dáng cây nhiều tầng tán nhìn từ xa; bảng năm nhóm đọc rõ khi đứng sát; workshop đã gỡ bảng. Giữ nguyên.

Còn thiếu, chỉ sửa đúng các điểm này:
1. **Màu thân trong khung chơi** (ảnh ingame-roots): thân vẫn gần đen. Yêu cầu: trung bình luma vùng thân trong ingame-roots ≥ 0,18 (đo trên vùng pixel của thân), tông nâu-xám ấm, có mảng rêu xanh ở gốc và mặt trên các rễ. Nếu do bóng tán che, thêm ánh sáng phụ/ambient riêng cho vật liệu thân (emissive rất nhẹ hoặc hemisphere tint) thay vì làm sáng cả khu.
2. **Bảng kỹ năng ở khoảng cách chơi:** trong ingame-roots bảng nghiêng gần như song song lối đi, chữ chỉ ~6 px. Yêu cầu: xoay bảng để mặt bảng hướng về người đi tới (góc giữa pháp tuyến bảng và hướng ngược lối đi ≤ 30°), đặt bảng sát mép lối (≤ 2 m), to hơn (rộng ~3 m), chữ nhóm cao ≥ 24 px trong ảnh ingame-roots 1600×900. Không che lối đi.
3. **Old Trail luma −0,032:** chụp lại main và RT-02 cùng phiên (cùng bản build main mới nhất — rebase lên main trước: `git rebase main` không được vì sandbox; thay vào đó so với `http://127.0.0.1:4180` nếu có, hoặc ghi rõ nguồn baseline). RT-02 không được đổi Old Trail; nếu lệch thì giải thích nguyên nhân.
4. Camera chơi cắt phần tán trên: chấp nhận; thêm một ảnh nhìn từ lối đi ngẩng lên (cameraPitch nếu QA hook có) cho thấy cành vươn qua lối.

Chạy lại gate + e2e world --workers=2 + ingame-shots High 8 khu + wide-shots roots, bàn giao như cũ.
