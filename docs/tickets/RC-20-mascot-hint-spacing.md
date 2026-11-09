## RC-20 — Gợi ý không chồng lên chip tương tác

- Vùng: src/features/world/index.ts (style mascotHint).
- P2 nhìn thấy ở ending-source-final/e-after.png: gợi ý mascot màu mực nằm trực tiếp trên nền cát/đường và chồng một phần lên chip E.
- Sửa: đặt gợi ý lên trên chip tương tác kể cả khi onboarding keys còn hiện; nền giấy, mực giữ palette, padding nhỏ và box-sizing để đọc được trên địa hình. Không đổi lời thoại, timer, focus hoặc pointerEvents.
- Phép thử: render thật VI/EN desktop1600 và1366, đo bounding rect mascot/interaction không giao nhau khi cùng có chữ; chụp ảnh. Unit không cần cho chỉnh style có thể đảo lại này. Full gate + e2e cuối vẫn bắt buộc.
- Trạng thái doing, chưa ghi PASS trước khi chạy.
