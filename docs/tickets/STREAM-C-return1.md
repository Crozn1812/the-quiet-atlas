## STREAM-C — trả lại vòng 1 (Lead)

Lead đã rebase W-D lên main `267eca1`. Main đã có FIX-PATCH (b90313c: nền xa không còn đâm xuyên đường mòn) và BUDGET-OFF (không còn trần; CPU ABBA chỉ ghi số, không chặn).

Tiến bộ: dải đất ướt, phản chiếu, nước sáng hơn. Nhưng thước đo siêu thực (HR-common.md) **chưa đạt**:
1. Mép nước vẫn **răng cưa/bậc thang** rõ ở ảnh hàng 2 và hàng 7 (zig-zag đen-xanh). Nguyên nhân có thể là giao tuyến ribbon với tam giác terrain thô. Cần mép mềm thật: fade alpha/độ đục theo khoảng cách tới mép tính bằng **độ cao terrain thật** (sample heightfield trong shader hoặc bake mặt nạ mép), tăng phân đoạn ribbon theo chiều ngang, thêm dải bọt/ướt mảnh. Không được còn đường cắt gấp khúc nhìn thấy ở High.
2. Chụp lại trên main mới (đã có FIX-PATCH). Nếu vẫn còn mảng xanh của far-landscape thì ghi file:dòng nguyên nhân, đừng chỉ "cần Lead".
3. Ảnh hàng 6 (con đường đá phẳng ở First Light): có phải lòng suối cạn không? Nếu là nước thì gần như không thấy được. Kiểm tra lại.

Không sửa file lòng suối mới (`water/streambed*.ts`, HR-STREAMBED đang làm). Xong: gate, build 1 lần, e2e world 43/43, ảnh trước/sau cùng góc. Không commit.
