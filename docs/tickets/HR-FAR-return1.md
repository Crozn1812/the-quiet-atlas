## HR-FAR — trả lại vòng 1 (Lead so `before/` với `production/`: horizon-far, milestones-far)

Gate kỹ thuật đạt, nhưng ảnh sau còn tệ hơn ảnh trước ở mấy chỗ:

1. **Núi xa thành khối "súp lơ" có mép răng cưa/pixel** (horizon-far góc trái trên; milestones-far ở giữa). Núi xa thật có sống núi liền, mép mềm do khí quyển, đỉnh và khe nhận sáng khác nhau. Làm núi bằng mesh có heightfield/ridged noise (hoặc impostor có alpha mịn, không cắt răng cưa), mờ dần xanh nhạt theo khoảng cách.
2. **Sọc dọc như mã vạch** (horizon-far bên trái giữa đồi; milestones-far bên trái): hàng billboard mỏng hoặc impostor tre bị nhìn từ cạnh. Bỏ hẳn: impostor phải quay theo camera hoặc chọn góc gần nhất, và không có thẻ nào bị nhìn thấy từ cạnh.
3. **Sườn đồi gần vẫn là mặt xanh trơn shading phẳng** (horizon-far): cần cỏ và đất theo độ dốc, có vệt đá và bụi xa dạng thấp. Chỉ áp cho phần far/mid trong vùng của ticket này; vách dốc gần thuộc HR-TERRAIN-CLIFF, không sửa `terrain/**`.
4. Mép tán atlas bị viền sáng hoặc xám (handoff có ghi): xử lý premultiplied alpha / alpha-to-coverage, dilate màu ra mép texture.

Mây vẫn kiểu hoạt hình nhưng **không thuộc ticket này** (Lead sẽ mở ticket bầu trời riêng); đừng sửa `sky/**`.
Điều kiện xong giữ như card: gate PASS; build 1 lần **sau thay đổi cuối**; e2e world `--workers=2` 43/43 trên build đó; ảnh High trước/sau cùng góc. Không commit.
