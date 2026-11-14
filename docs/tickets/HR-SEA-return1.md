## HR-SEA — trả lại vòng 1 (Lead, sửa nhỏ)

Lead đã rebase W-A lên main mới nhất (HR-STREAMBED, HR-TREE2, MS-C2; unit giờ khoảng 1900 test). Vệt nắng vàng, phản chiếu trời, sương chân trời: **rất tốt, giữ nguyên**. Hai lỗi thấy rõ ở comparison-high.webp:

1. **Mảng xanh ngọc cạnh thẳng hình chữ nhật/đa giác** (ảnh sun-high, góc phải dưới; cả viền quanh mũi đất last-postcard): màu nước nông đang theo một mặt nạ có cạnh thẳng (bounding box hoặc tam giác thô). Phải theo **độ sâu terrain thật** (sample heightfield/depth như STREAM-C dùng `water/depth.ts`) và chuyển màu mượt: không còn cạnh thẳng hay góc nhọn nhìn thấy được.
2. **Xanh ngọc quá bão hòa (neon)**, nhất là dải dọc suối ở quiet-shore. Giảm độ bão hòa, xanh ngọc trong và hơi xám như nước biển thật lúc hoàng hôn, ảnh hưởng bởi màu trời cam; **không đổi màu suối** (suối là STREAM-C; nếu shader biển đang tô lên cửa suối thì giới hạn lại theo vùng biển).

Build 1 lần. Xong: gate, e2e world 43/43, ảnh trước/sau cùng 3 góc. Không commit.
