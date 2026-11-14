## HR-TERRAIN-CLIFF — trả lại vòng 1 (Lead xem `comparison.webp`)

**Ảnh sau gần như giống ảnh trước.** Vách vẫn là **một tấm phẳng đứng màu be**, **mép trên là một đường thẳng tắp**, và hoa văn lặp đều như giấy dán tường. Thay đổi duy nhất thấy được là vài tảng đá tối ở chân vách. Mục tiêu "phá mặt phẳng" chưa đạt. Cần:

1. **Hình khối thật:** mặt vách phải lồi lõm theo chiều sâu 0,5–2 m, gồm gờ đá nằm ngang theo lớp trầm tích, hõm, mỏm nhô, khối nứt tách. Làm bằng tăng lưới và displacement trên CPU khi dựng mesh, hoặc thêm mesh vỏ đá (`hr-cliff-*`) ốp lên mặt vách. Normal map đơn thuần là không đủ. **Mép trên phải gồ ghề**, có đất và rễ phủ xuống, không phải đường thẳng.
2. **Hết lặp:** trộn 2–3 texture đá ở tỉ lệ khác nhau, thêm biến màu theo noise lớn (vệt sẫm do nước chảy, mảng rêu xanh ở chỗ ẩm, vệt sáng khô). Ở khoảng cách 10 m không được nhận ra ô lặp.
3. **Chân vách:** đá vụn nhiều cỡ, có đất và lá phủ lên, cỏ mọc xen. Không để đường cắt thẳng giữa vách và nền.
4. **Collider không đổi.** Nếu mesh vỏ nhô ra ngoài collider ≤ 0,5 m thì chấp nhận được, miễn không chắn lối đi. Kiểm tra lại bằng e2e.
5. FPS góc tán cây vốn đã 47 trước ticket này. Không bắt sửa, nhưng không được làm tụt thêm.

Điều kiện xong giữ như card. Ảnh trước/sau cùng 7 góc như `comparison.webp`, kèm 1 ảnh cận mép trên vách. Không commit.
