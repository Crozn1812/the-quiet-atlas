## HR-LIGHT — trả lại vòng 1 (Lead)

Lead đã rebase W-A lên main mới nhất (có HR-ROOTS-SIGN). Kỹ thuật tốt (gate, e2e 43/43, FPS ổn), nhưng **ảnh trước/sau gần như giống hệt nhau** ở cả first-light, roots-sun, horizon: người xem không thấy thay đổi. Đợt này cần khác biệt **nhìn thấy rõ** theo thước đo siêu thực:

1. **Tia nắng xuyên tán (god rays)**: trong ảnh roots-sun và rừng First Light phải thấy rõ các cột sáng xiên qua khe lá, có bụi lơ lửng; cường độ đủ thấy nhưng không trắng xóa. Nếu screen-space chỉ hiện khi mặt trời trong khung hình, thêm **cột sáng thể tích giả** (mesh hình nón/billboard additive có noise, gắn theo hướng nắng, fade theo khoảng cách) ở các khe tán.
2. **Mặt đất rừng**: hiện vẫn là texture phẳng + cỏ nhọn thưa. Cần **thảm lá mục** (instanced decal/mesh lá rơi nhiều màu nâu-vàng), **rễ nổi** gần gốc cây lớn, **cỏ 3D dày** (nhiều lá, cao thấp khác nhau, uốn, màu biến thiên) ở chỗ có nắng như sườn Horizon; mép lối mòn có cỏ lấn và đá vụn.
3. **Phối cảnh khí quyển**: núi/đồi xa phải nhạt dần và ngả xanh xám theo khoảng cách; sương mỏng theo độ cao ở thung lũng suối buổi sáng.
4. **Hồi quy Roots**: CPU 519 → 718 ms/s ở after-2. Tìm nguyên nhân và giảm (instancing, cập nhật theo lô); báo cáo lại.

Ảnh trước/sau phải chọn góc thấy được hiệu ứng (nắng chiếu qua tán, sườn đồi có nắng, nhìn xa). Build 1 lần **sau thay đổi cuối**, e2e world 43/43 trên build đó. Đo FPS High RTX 3060. Không commit.
