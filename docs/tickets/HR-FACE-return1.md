## HR-FACE — trả vòng 1 (Lead): chưa giống Duy
Phần kỹ thuật đạt (gate, e2e, nối vào game). Giữ nguyên pipeline, rig, áo, tay, kính (kính đã khá đúng).
Lead đã đối chiếu `test-results/hr-face/comparisons/*.png`. Ở cả ba góc, mặt chưa nhận ra là Duy. Sửa theo thứ tự quan trọng:

1. **Khuôn mặt** (quan trọng nhất). Mặt Duy **tròn và rộng**: má đầy, hàm mềm, cằm ngắn và tròn, gò má không nhô. Bản hiện tại dài, hẹp, má hóp, gò má sắc, cằm dài, nên thành mặt người khác.
   - Đo tỷ lệ trên `front-mirror-neutral-05` đã lật: rộng mặt ở gò má / cao từ chân tóc tới cằm; rộng hàm / rộng gò má; khoảng giữa hai mắt; rộng mũi / rộng miệng.
   - Ghi bảng số "ảnh vs model". Mỗi tỷ lệ lệch không quá 3%.
2. **Đỉnh đầu và cổ:** đỉnh đầu hiện quá cao, hàm-cổ quá dài. So profile với `profile-right-sun-02`.
3. **Mắt:** một mí nhưng mở rõ, thấy tròng nâu đen; hiện tại là khe hẹp. Lông mày đậm, dày, gần thẳng, đuôi hơi xuống.
4. **Mũi:** sống thấp, cánh mũi rộng, đầu mũi tròn. Hiện tại sống cao, mũi hẹp.
5. **Môi:** đầy hơn, môi dưới dày, màu hồng tự nhiên. Hiện chỉ là một đường mỏng.
6. **Da:** bỏ hết các mảng tối loang ở má và hàm (rõ ở góc nghiêng và 3/4). Tông da ấm, đều, sáng như `duy-front-01`. Có biến thiên nhẹ: má hơi hồng, quanh mắt hơi tối. Không loang bẩn, không bóng nhựa.
7. **Tóc:** hiện là tóc nhím đen dựng đứng, hai bên có đường cắt cứng như mũ, hai bên gần như cạo. Tóc Duy:
   - Màu đen nâu, mềm, dày, rối tự nhiên.
   - Đỉnh có volume.
   - **Mái lòa xòa rủ xuống trán**, tách vài lọn.
   - Hai bên ngắn nhưng vẫn có tóc, che một phần trên tai. Gáy gọn.
   - Không có đường viền cứng nào.
   - So với `front-close-eyes-03`, `profile-right-34-08` và `duy-front-01`.
8. **Ánh sáng:** mặt ngược sáng ở Last Postcard còn tối. Thêm rim hoặc fill nhẹ cho riêng nhân vật nếu cần, nhưng không đổi ánh sáng world.

**Công cụ được phép thêm (Lead duyệt):**
- MediaPipe Face Landmarker (Apache 2.0). Cài bằng pip vào venv **trong worktree** (`tmp/`, gitignore), chạy hoàn toàn trên máy.
- Lấy 478 điểm mốc 3D từ từng ảnh để khớp shape key hoặc sculpt.
- Không dùng mô hình có giấy phép phi thương mại. Không gửi ảnh ra khỏi máy. Không commit venv hay model.

**Bằng chứng:**
- Ba ảnh so sánh như trước, thêm ảnh chính diện cười cạnh `duy-front-01`.
- Bảng tỷ lệ "ảnh vs model".
- Ảnh trong game ở First Light, Roots và Last Postcard.

Điều kiện xong như card. Không commit.
