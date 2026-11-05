## Đợt 24: cảnh bờ biển hoàng hôn (theo mô tả của Duy, Q-37, 2026-11-05)

Duy tả cảnh khu biển (Quiet Shore → Last Postcard, `t` 0.82–1 trên đường đi):

> Mình đang đi trên một con đường nhìn qua bờ biển. Mặt biển phản chiếu ánh mặt trời hoàng hôn. Bên trái là núi với tán cây, tán lá dày đặc: mù mờ nhưng đầy ẩn ý, bí ẩn. Bên phải là bờ biển uốn cong, mặt biển sóng đánh nhẹ nhàng: bình thản, nghỉ ngơi. Ánh hoàng hôn làm tâm trạng dịu nhẹ, êm ấm.

"Trái/phải" tính theo **hướng người chơi đi** (từ Quiet Shore tới Last Postcard). Ảnh tham chiếu: không có, dựng theo mô tả. Không chép khung hình phim nào.

Quy tắc chung (bắt buộc):

- Màu chỉ lấy từ `PALETTE` (qua tint/lerp). Cam chỉ ở mặt trời, phản chiếu và vài chấm nhỏ.
- Ngân sách §8 không tăng: không thêm pass hậu kỳ, không thêm texture tải về, draw call tăng ≤ 2 cho cả ticket.
- **Kiểm bằng mắt bắt buộc:** chạy `pnpm exec vite tools/styleframes`, mở `/tour.html?zone=quiet-shore&view=approach|wide` và `?zone=last-postcard&view=approach|wide`. Ghi trong bàn giao đã xem cảnh nào, thấy gì.
- Test cũ phải pass. Đổi kỳ vọng test nào thì ghi lý do.
- Điều kiện xong: `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
- Chỉ sửa đúng file được giao. Các ticket khác của đợt 24 chạy song song ở file khác.
