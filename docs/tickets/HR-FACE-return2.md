## HR-FACE — trả vòng 2 (Lead, lần trả cuối)
Khuôn mặt đã tròn hơn, tỷ lệ gần Duy hơn: giữ phần hình học tổng thể. Các lỗi sau khiến mặt trông như búp bê, đáng sợ hơn bản trước. Sửa theo thứ tự:

1. **Mắt (lỗi nặng nhất):** ở mọi góc, hai mắt là hai hốc đen, không thấy tròng trắng, mống mắt hay ánh phản chiếu.
   - Cần: lòng trắng hơi ngà; mống mắt nâu đen có vân; đồng tử; giác mạc trong, có điểm sáng nhỏ.
   - Mí trên một mí phủ một phần mống mắt, mắt mở như `front-close-eyes-03`.
   - Kiểm tra mesh mắt có bị che bởi mí hoặc kính, hoặc material bị đen do normal/alpha.
   - Chụp `eyes-debug` cận mắt để chứng minh.
2. **Texture da từ ảnh:** da hiện trơn như đất sét, chưa thấy chiếu ảnh.
   - Chiếu thật các ảnh `duy-front-01` và `front-mirror-neutral-05` (đã lật), cùng profile phải, lên UV. Khử bóng.
   - Trộn mép bằng mask mềm. Lấy chi tiết thật từ ảnh: lông mày, nốt nhỏ, tông môi, quầng mắt.
   - Chụp UV texture cuối (ảnh phẳng) để Lead xem.
   - Normal/roughness có lỗ chân lông.
3. **Môi:** môi xám, mỏng. Cần hồng tự nhiên, môi dưới đầy, đường viền mềm.
4. **Cười:** hàng răng vuông trắng đều như răng giả. Chọn một trong hai:
   - (a) nụ cười khép môi, khóe miệng lên, má nâng, mắt híp nhẹ;
   - (b) răng thật: từng chiếc, màu ngà, có lợi, có bóng trong miệng, chỉ lộ hàm trên như ảnh.

   Mặc định trong game vẫn là neutral.
5. **Tóc:** úp như cái bát, mái thành các sợi thưa như răng lược.
   - Cần: đỉnh có volume dựng nhẹ, rối như `front-mirror-neutral-05`; mái dày, lọn tách tự nhiên, phủ trán không đều.
   - Card dày đặc hơn ở gốc. Màu đen nâu, có highlight.
6. **Tai:** dính sát, nhỏ. Tai Duy hơi chìa, to vừa (xem `front-smile-bw-06` và `profile-right-stream-04`).

Bằng chứng: như vòng 1, thêm `eyes-debug` và UV texture. Không commit.
