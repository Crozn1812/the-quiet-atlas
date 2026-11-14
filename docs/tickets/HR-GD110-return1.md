## HR-GD110 — trả lại vòng 1 (Lead xem ảnh studio after-high-side / three-quarter và world-A1/driving)

Đã tiến bộ rõ (nan hoa, cánh tản nhiệt, giảm xóc lò xo, dây cáp, yên da). Còn các lỗi sau, sửa hết:

1. **Chân chống là một que gỗ nâu** cắm dưới động cơ, nhìn như cây gậy chống xe. Thay bằng chân chống nghiêng kim loại sơn đen, có lò xo hồi, đặt đúng chỗ bên trái gần gác chân. Khi đỗ, xe nghiêng nhẹ khoảng 8–10° tựa lên chân chống và chân chống chạm đất. Khi lái thì chân chống gập lại.
2. **Chắn bùn có lốm đốm chấm đen như nhiễu**, và ở ảnh nhìn ngang mép chắn bùn có viền trắng lởm chởm (lỗi alpha/aliasing). Bỏ lốm đốm. Bụi đường là dải mờ dần, đậm ở mép dưới phía sau, có vệt bắn từ bánh. Kiểm tra mép bằng ảnh cận ngang.
3. **Vật liệu phẳng như nhựa:** bình xăng trắng không có phản chiếu, crôm như nhôm xám mờ. Bình xăng phải có lớp sơn bóng clearcoat với highlight dài theo cong bình. Crôm phải phản chiếu môi trường. Chụp studio bằng **environment map giống trong world** (PMREM), không phải ánh sáng phẳng, để đánh giá đúng.
4. **Nắp hông là hộp trắng vuông vức:** cần bo tròn, có khe nối, 1 ốc vít và vết xước nhẹ. Không có chữ, không có huy hiệu.
5. **Xi-nhan là quả cầu cam to:** đổi thành vỏ xi-nhan thật (chụp nhựa amber trong mờ, cuống crôm), nhỏ cỡ thật.
6. **Texture thêm 9,94 MB:** gom atlas, giới hạn 1024 cho chi tiết nhỏ nếu không mất chất lượng ở cận cảnh. Chỉ cần báo cáo, không phải gate.

Điều kiện xong giữ như card: gate PASS; build 1 lần **sau thay đổi cuối**; e2e world `--workers=2` 43/43 trên build đó; ảnh High trước/sau 4 góc + đang lái + Low; `check:assets` và `check:licenses` PASS. Không commit.
