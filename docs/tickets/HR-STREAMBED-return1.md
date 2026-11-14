## HR-STREAMBED — trả lại vòng 1 (Lead)

Lead đã rebase W-A lên main `c81f68f` (có STREAM-C: mép nước fade theo độ sâu thật). Kiểm tra lại cùng lúc với nước mới.

Tiến bộ rõ: lòng suối có sỏi, đá tảng. Chưa đạt thước đo siêu thực (HR-common.md):
1. **Sỏi một màu xám xanh, hình elip dẹt giống nhau** → biến thiên màu theo viên (nâu vàng, xám, đỏ gạch, trắng thạch anh lác đác), tối hơn và bóng hơn khi ướt dưới nước, sáng và khô hơn trên bờ; hình dạng và độ dày đa dạng hơn (ít nhất 6 mesh sỏi khác nhau, xoay và tỉ lệ ngẫu nhiên); sỏi nhỏ lấp khe giữa sỏi to.
2. **Vòng bọt trắng quanh đá là vòng tròn chấm đều, trông như decal giả** → bọt không đều, dài về phía hạ lưu theo dòng, chuyển động, mờ dần; không có viền tròn hoàn hảo.
3. **Rêu trên đá tảng gần như không thấy** → rêu xanh rõ ở phần ẩm sát mặt nước và mặt trên chỗ râm; đá tảng có texture đá thật (CC0), không phải khối mờ đều.
4. **Rong**: phải thấy rõ dải rong lay theo dòng trong ảnh High cận.
5. Ảnh hàng 3 (đá ở lối đi gần Roots): nước gần như vô hình, sỏi như nằm trên cạn. Sau khi rebase lên STREAM-C kiểm tra lại; sỏi chỉ trong lòng suối hoặc bờ ướt.
6. Low: sỏi chấm đen trên nền xanh phẳng trông lỗi → Low dùng ít sỏi hơn nhưng cùng màu với High, hoặc chỉ texture đáy.

Build chỉ 1 lần cuối. Xong: gate, e2e world 43/43, ảnh trước/sau cùng góc High (cận + trung) + Low. Không commit.
