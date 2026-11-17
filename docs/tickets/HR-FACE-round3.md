## HR-FACE — vòng 3 (Duy chọn trả thêm một vòng, 17/11). Chia nhỏ, làm lần lượt.
Giữ nguyên:
- Khung mặt, tỷ lệ (đã đúng 0,2–1,2 %).
- Mắt có tròng (đã đạt).
- Kính, rig, áo, tay.

Làm theo thứ tự. Sau **mỗi** phần, chụp lại 4 ảnh so sánh vào `test-results/hr-face/r3-<phần>/` để thấy tiến bộ từng bước.

### Phần 1 — Miệng và nụ cười (quan trọng nhất)
- **Neutral:** môi đang méo, mím, lệch như nhăn mặt.
  - Cần môi khép thả lỏng, đối xứng.
  - Môi trên mỏng vừa, môi dưới đầy, có rãnh nhân trung.
  - Khóe miệng hơi lên (Duy có nét miệng hiền), màu hồng tự nhiên.
  - So với `front-mirror-neutral-05` (đã lật) và `profile-right-sun-02`.
- **Smile=1:** gần như không cười. Cần cười như `duy-front-01` và `front-smile-bw-06`:
  - khóe miệng kéo rộng và lên;
  - má nâng, nếp mũi-má rõ;
  - mắt híp lại thành vầng trăng khi cười;
  - lộ hàm răng trên thật: từng chiếc, màu ngà, có lợi, trong miệng tối.
- Kiểm tra weight/shape key quanh miệng không kéo méo da khi chuyển 0 → 1.

### Phần 2 — Da
- Da đang bóng như nhựa, trông như búp bê trẻ con. Cần da người trưởng thành ~22 tuổi:
  - texture chiếu từ ảnh rõ hơn (không làm mờ quá tay);
  - roughness cao, chỉ vùng chữ T hơi bóng;
  - có lỗ chân lông, vài vết nhỏ;
  - subsurface ấm ở tai, mũi, môi.
- Bóng đổ quanh hốc mắt, dưới mũi, dưới môi, dưới cằm phải rõ để mặt có chiều sâu thay vì phẳng.

### Phần 3 — Tóc
- Tóc lên hình như **đan rổ**: lớp card lặp thành ô chéo đều.
- Cần các lọn tóc to nhỏ khác nhau, hướng ngẫu nhiên theo xoáy:
  - đỉnh dựng rối như `front-mirror-neutral-05`;
  - mái rủ không đều;
  - hai bên ngắn, ôm đầu, tai lộ ra.
- Bỏ mọi pattern lặp. Không có đường viền cứng.

Bằng chứng cuối: 4 ảnh so sánh, `eyes-debug`, ảnh cận miệng ở neutral và smile, 3 ảnh trong game. Điều kiện xong như card. Không commit.
