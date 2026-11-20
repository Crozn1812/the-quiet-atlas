# ADR 0020 — Xe chạy tự do khắp bản đồ; chỉ còn hai mức chất lượng

- Ngày: 2026-11-20
- Trạng thái: Chấp nhận (Duy yêu cầu sau khi chơi demo, 20/11)
- Thay: spec V6 §6 "Xe chạy trong hành lang đường hợp lệ (spline)"; ba mức Low/Balanced/High.

## Bối cảnh

Duy chơi demo bản d6c611e và báo:

1. Xe như bị tường vô hình chặn giữa các khu, phải lách qua khe mới qua được.
2. Xe không chạy qua cầu được, cũng không đi hết bản đồ được.
3. Mức **Balanced** lỗi hình ở nhiều góc.

Nguyên nhân của (1)(2): mô hình xe `src/features/vehicle/model.ts` chạy theo hành lang spline của lối đi, toạ độ `(s, lateral)`. Độ lệch ngang bị kẹp ở `PATH_WIDTH/2 + 1 − 0,5 m`. Mép hành lang chính là bức tường vô hình. Cầu và các khu nằm ngoài spline thì xe không tới được.

## Quyết định

1. **Xe lái tự do** trên mặt phẳng XZ: W/S tăng tốc và phanh/lùi, A/D bẻ lái theo tốc độ. Kiểu điều khiển vẫn là arcade, không mô phỏng cơ học.
   - **Cái chặn xe:** chỉ collider thật (vật thể, vách đá, nước sâu) và biên thế giới.
   - **Không còn:** hành lang ngang.
   - Xe chạy qua được mọi cầu và lối đi giữa các khu.
2. **Giữ nguyên từ spec:**
   - manual và cruise dùng chung một collider;
   - cruise giữ tốc độ, đi chậm rồi dừng trước vật cản;
   - Esc, C, mở UI, mất focus đều hủy cruise;
   - E chỉ xuống xe khi có chỗ đứng an toàn.
3. **Chất lượng chỉ còn Low và High.** Mặc định là High khi máy đạt probe, Low khi không đạt. Adaptive hạ thẳng High → Low. Mọi nhánh Balanced bị bỏ.

## Hệ quả

- Test xe và test chất lượng phải viết lại theo mô hình mới.
- Ngân sách FPS vẫn đo ở High và Low (ADR 0007, 0019).
- Spec §6 dòng xe theo spline coi như được ADR này thay.
