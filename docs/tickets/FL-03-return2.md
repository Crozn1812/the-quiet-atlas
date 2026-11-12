FL-03 — Lead trả lại vòng 2 (vòng cuối trước khi Lead tự sửa). Ảnh: test-results/fl03-review/r1-comparisons/first-light.webp.

Đã đạt, giữ nguyên: tán kín trời (sky-fraction đạt ở 4 khu), vách núi phía sau, luma First Light 0,217, suối lội được có cá.

Chỉ sửa 3 điểm:
1. **Khối đá xếp tầng trước vách** (chỗ tảng đá nguồn cũ): đang là 3–4 tấm đá dẹt chồng lên nhau, mép thẳng, trông như đĩa lơ lửng giữa bãi cỏ. Bỏ khối này. Nguồn suối nằm **ở chân vách**: một hõm/khe đá ở chân vách, nước chảy ra, vài tảng đá vỡ (talus) nằm lẫn cỏ và rêu ở chân vách, cắm xuống đất (không có tảng nào hở đáy hoặc lơ lửng). Thác nhỏ và vũng giữ nguyên.
2. **Tia nắng:** hiện là nhiều vạch trắng cứng, đều nhau, chạy qua cả vách núi, trông như mưa hoặc vết xước. Yêu cầu: 6–10 tia **mềm**, mép mờ dần (gradient ngang), độ đục thấp (đỉnh ≤ 0,18), dài ngắn khác nhau, mờ dần cả hai đầu, chỉ xuất phát từ khe tán và dừng trước mặt đất; không tia nào vẽ đè lên vách núi hay trời. Vẫn xiên trái → phải, lấp lánh nhẹ.
3. **Tông màu:** cả khung bị ám xanh ngọc/cyan và phẳng (đường đất cũng xanh). Trả lại tông bình minh của main: lục rừng ấm, đường đất vàng nâu, sương xanh lục nhạt chỉ ở xa. Đo `ground-hue.mjs` cho đường đất First Light: hue trong ±8° so với main.

Đồng thời: worktree đang ở base cũ; main đã có RT-02 (roots.ts mới) và WS-02 (workshop.ts). FL-03 không sửa hai file đó; chỉ chú ý khi chụp so sánh dùng main mới nhất (cổng 4180 do Lead dựng nếu cần, hoặc ghi rõ baseline).

Chạy lại gate + e2e world --workers=2 + ingame-shots High 8 khu + sky-fraction + luma + ground-hue; bàn giao như cũ.
