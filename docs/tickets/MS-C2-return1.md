# MS-C2 — trả lại lượt 1 (lượt cuối)

Lead đã xem `test-results/ms-c2/world/high-front.png`. Tiến bộ: mạng nứt vàng kintsugi, mặt khép mắt + kính, chữ khắc thay chữ đen, khôi phục đủ 17 test. Còn chặn:

1. **CPU +13,06 ms/s > +10.** Tìm phần tốn: JS mỗi frame (dải sáng, hạt, xoay mảnh, cập nhật uniform/matrix, `traverse`, tạo object/array mỗi frame), hay shader compile/biến thể vật liệu. Mọi chuyển động phải ở vertex shader với một uniform time; ngoài 30 m dừng hẳn (không update, có thể ẩn hạt/dải); không cập nhật khi tab ẩn. Đo ABBA lại, dán bảng.
2. **Mất tư thế bước:** ảnh mới đứng thẳng, hai tay buông. Khôi phục **tư thế đang bước** của MS-C (một chân trước, tay đánh nhẹ, đầu hơi cúi).
3. **Vẫn như ma-nơ-canh:** vai vuông, cổ ống tròn, tay chân như ống. Dùng hình nhân vật thật của game (`public/world/character/character-duy-c.glb`, đã có dáng người) làm gốc, bake tư thế bước + subdivision/làm mịn, thêm nếp áo sơ mi và quần ống rộng bằng normal map bake; giữ ≤ ngân sách tam giác.
4. **Chữ khó đọc:** khắc chìm nhưng phải đọc được ở 6–8 m: tăng tương phản (lòng chữ vàng nhạt phát sáng nhẹ trên kính, hoặc viền tối mảnh), cỡ chữ lớn hơn, mặt mảnh quay về phía người xem nhiều hơn.

Được **một lần build**. Phạm vi và ngân sách như `MS-C2.md`. Xong: gate PASS; e2e world 43/43; CPU ABBA ≤ +10 ms/s (dán bảng); ảnh High front/back/sockets + Low + clip 10 s. Không commit.
