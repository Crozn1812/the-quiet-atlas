## HR-CLIFF — trả lại vòng 1 (Lead)

Lead đã rebase W-B lên main mới nhất (có HR-TREE2 rừng mới, HR-STREAMBED). Gate kỹ thuật tốt, nhưng hình chưa đạt và còn sai hướng:

1. **Vách thành các khối tròn màu tím xám như súp lơ/não** (ảnh high-wide sau). Vách đá thật ở rừng nhiệt đới Việt Nam là **mặt vách gần đứng**, có **lớp đá phân tầng nằm ngang/nghiêng**, gờ, bậc nhô, khe nứt dọc, chỗ sụt lở, mảng đá vụn ở chân; màu **xám ấm, nâu vàng, vệt nước đen chảy dọc**, rêu xanh ở gờ và chỗ ẩm, cây bụi bám khe. Không có khối tròn, không màu tím.
   - Dùng texture scan CC0 của Poly Haven loại rock face/cliff (vd. `rock_face`, `cliff_side`, `rocky_trail`, `aerial_rocks`; kiểm tên thật và license) với triplanar mapping để không giãn UV; normal + AO + roughness; màu chỉnh ấm.
   - Hình học: nhiều mảnh vách phẳng-gồ (displacement theo lớp đá), không phải bóng tròn; silhouette trên đỉnh lởm chởm, có cây mọc trên đỉnh.
2. **Ảnh high-face bị lá cây che kín**: chọn góc camera thấy rõ mặt vách (đứng trên lối mòn nhìn lên), chụp cận để thấy khe nứt, rêu, dương xỉ trong khe và thác nhỏ.
3. Thời gian tới lúc chơi được Low **25,5 s** khi đang chạy e2e: đo lại riêng; vách Low không được tải GLB/KTX2 của High.
4. Phạm vi: chấp nhận `terrain/spring.ts` (nơi dựng vách).

Build 1 lần cuối. Xong: gate, e2e world 43/43, ảnh trước/sau cùng góc wide + face + gameplay + Low. Không commit.
