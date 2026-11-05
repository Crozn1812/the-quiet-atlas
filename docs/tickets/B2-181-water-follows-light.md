## TICKET B2-181: nước (suối, biển) nhận màu ánh sáng bình minh / hoàng hôn

- Được sửa: `src/features/world/water/material.ts`, `src/features/world/scene/compose.ts` (**chỉ** vòng cập nhật nước: truyền màu từ grade), và test nước/biển/compose.
- Đọc `_dirA-common.md`.

### Lead thấy trên ảnh (sau B2-180)

- Rừng đã là bình minh, biển đã là hoàng hôn. Nhưng **suối và biển vẫn xanh ngọc sáng như giữa trưa**, nhìn như phát sáng.
- Gần chân trời biển vẫn còn vài vệt sáng thẳng (B2-178 chưa hết hẳn).

### Việc

1. **Màu nước nhân theo ánh sáng của grade** tại vị trí người chơi: `sunColor × sunIntensity` và hemi, giống cách mặt đất nhận sáng. Không phát sáng tự thân.
   - **Rừng bình minh:** suối xanh lá-ngọc tối, phản chiếu chút hồng đào của chân trời.
   - **Biển hoàng hôn:**
     - gần bờ xanh ngọc tối dần;
     - xa bờ xanh tím đậm;
     - vệt phản chiếu mặt trời màu cam vàng (giữ B2-160).
2. **Phản chiếu bầu trời:** trộn màu chân trời của grade (`skyHorizon`) vào mặt nước theo góc nhìn (Fresnel rẻ), càng xa bờ càng giống màu trời.
3. **Vệt thẳng:** tìm nốt nguồn còn lại (wash hoặc glimmer kéo dài theo phối cảnh) và bỏ. Kiểm thêm góc nhìn từ cao (tour `quiet-shore` wide).
4. Không thêm texture hay render target.

### Test

- Màu nước ước lượng trên CPU ở rừng t = 0,15 có luma ≤ luma mặt đất cùng điểm × 1,3.
- Ở biển t = 0,93: luma ≤ 0,35 và R/B lớn hơn ở giữa trưa (t = 0,55).
- Không có dải sáng liên tục > 40 m (test B2-178 mở rộng thêm góc nhìn cao 9 m).
- Test cũ pass.

### Bổ sung (Lead, 2026-11-06)

- Ảnh `01-duong-ven-bien`: dải suối chạy dọc bên trái đường ven biển sáng xanh ngọc gần như trắng, nổi hơn cả mặt đường. Sau ticket này dải đó phải tối hơn mặt đường cùng khoảng cách (test luma CPU ở t = 0,86).
- Đọc thêm `_asset-common.md` (bóng không đen, không bão hoà mạnh).
