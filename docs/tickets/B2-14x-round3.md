## Vòng 3 Art Director: trong bối cảnh thật (đợt 23). Mỗi mục là 1 ticket

Quy tắc chung:

- **Kiểm bằng mắt bắt buộc:** chạy `pnpm exec vite tools/styleframes`, mở `/tour.html?zone=<id>&view=approach|wide`. Trang này dùng bộ ghép world thật: địa hình, thông, sương, nước. Ghi vào bàn giao bạn đã xem những cảnh nào và thấy gì.
- Các test cũ phải pass. Nếu đổi kỳ vọng của test thì ghi lý do.
- Màu chỉ lấy từ PALETTE.
- Khu (`zones/*.ts`) tuân theo `_zone-common.md` và `zones/types.ts`.
- Từ giờ có thêm test bắt buộc: dựng khu trên **địa hình thật** qua `placeZoneScenes(surfaceHeight)` (từ `src/features/world/zones` + `scene/compose`) không được ném lỗi.

### B2-141 `zones/quiet-shore.ts`: nhìn thấy biển, có xe và ghế
- Xoay hoặc dời cụm cảnh sao cho **biển nằm trong góc nhìn từ đường đi** khi tới gần. Hiên và hàng rào làm tiền cảnh, biển làm hậu cảnh.
- **Xe dựng:** một chiếc xe máy cũ màu kem đặt cạnh hiên, đơn giản ≤ 600 tam giác. Không chữ, không logo, không phải GD110 thật của người chơi.
- Ghế secret ở gần đó vẫn giữ nguyên, không thêm ghế khác.
- Hoa trên hàng rào to hơn, khoảng 0,25 m mỗi cụm, để nhìn thấy từ 15 m.

### B2-142 `post/paper.ts`: nét mực không vẽ theo cạnh tam giác địa hình
- Ngưỡng của nét mực phải theo **gián đoạn độ sâu tương đối** (bước nhảy depth so với khoảng cách), không dựa trên chênh lệch nhỏ giữa các mặt phẳng gần đồng phẳng. Sườn đồi liên tục không được có nét mực.
- Mép vật (thân cây, đạo cụ, nhân vật) vẫn phải có mực.
- Kiểm `tour.html?zone=milestones&view=approach` và `?zone=roots`: hết các đường kẻ chạy trên sườn.
- Giữ ngân sách, không thêm pass.

### B2-143 `sky/grade.ts` + `art/direction.ts`: lấy lại dải sáng tối
- `hemiGround` tối hơn khoảng 12 %, màu đất của hướng C tối hơn khoảng 8–10 %.
- Fog của biome bờ biển (thời điểm chiều tối) có `far` khoảng 400 m để thấy đường chân trời biển. Fog rừng giữ nguyên.
- Sọc xanh nhạt nằm ngang trên đất (dải ramp/bóng) mềm hơn: kiểm số bậc ramp và độ mềm của đất.
- Cập nhật test grade và test hướng C kèm lý do.

### B2-144 `zones/roots.ts`
- Gốc cây ×1,6, rễ dày khoảng 0,25 m, chữ S rõ.
- Đặt interactable và gốc cây **lùi khỏi mép bờ**: cách mép dốc ≥ 3 m, dùng `heightAt` để tránh chỗ dốc.

### B2-145 `zones/first-light.ts`
- Cột đặt sổ cao 1,4 m, có khối "cuốn sổ" nhìn rõ.
- Vệt nắng đậm hơn.
- Thêm 1 cụm hoa cam to hơn, khoảng 0,25 m, nhìn thấy được.

### B2-146 `zones/milestones.ts`
- Màu đá tối hơn: `ink` lerp `paper` 0,45, để không trùng độ sáng với trời.
- Đá giữa cao 2,4 m.
- Toàn cụm lùi khỏi mép dốc phía đường để nhìn thấy cả thân đá từ đường, không chỉ đỉnh. Dùng `heightAt` để chọn nền phẳng.

### B2-147 `zones/workshop.ts`
- Mảng rêu trên mái nhìn thấy được: `forestDeep`, ≥ 25 % diện tích mái.
- Thùng gỗ đổi sang màu gỗ (ink lerp dusk/paper), không dùng teal.
- Chái có 1 mảng tối màu mực (vách trong) để tách khỏi nền.

### B2-148 `zones/last-postcard.ts`
- Bãi xung quanh không trơn trụi: vài cụm cỏ biển, 2–3 tảng đá, một đoạn hàng rào gỗ thấp.
- Giữ bệ gỗ và hộp thư như vòng 2.

### B2-149 `foliage/scatter.ts` + `foliage/instances.ts`: rừng tự nhiên hơn
- Rải theo cụm: Poisson cộng clump, không đều như lưới.
- **30 % tán cây** tông `forestDeep`, qua biến thể material hoặc vertex color.
- **Gần khu:** trong 15 m quanh khu, không cây nào nằm trong nón 60° từ khu nhìn về đường đi. Lấy dữ liệu từ `ZONES`.
- Biome bờ biển: thêm cây bụi thấp hoặc cỏ thưa, để không cắt cụt từ rừng sang trống trơn.
- Giữ ngân sách instance và draw call.
