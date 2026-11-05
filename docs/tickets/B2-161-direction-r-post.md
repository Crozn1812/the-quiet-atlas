## TICKET B2-161: bật preset R, hậu kỳ "trong" (bỏ màn sữa trên toàn world)

- **Được sửa:**
  - `src/features/world/art/direction.ts`: preset R, và đặt `WORLD_DIRECTION = STYLE_PRESETS.R`;
  - `src/features/world/post/paper.ts`;
  - `src/features/world/scene/paper.ts`;
  - `src/features/world/materials/ramp.ts`;
  - `src/features/world/scene/compose.ts`: **chỉ** hàm `directGrade` và các hằng `FOG_HORIZON`/`DIRECTED_SKY`;
  - test liên quan.
- Đọc `_dirA-common.md`.

### Việc

1. Đặt `WORLD_DIRECTION = STYLE_PRESETS.R`, rồi tinh chỉnh giá trị của preset R. Lead đã đặt sẵn giá trị khởi điểm.
2. **Hậu kỳ:**
   - Bỏ lớp tông giấy kem phủ cảnh (paper wash) và grain đậm. Ở R, grain rất nhẹ hoặc tắt.
   - Không nét mực trên địa hình (`edges.ink = false`). Loang mép màu nước chỉ còn rất nhẹ.
   - Vẫn là một pass duy nhất, không thêm pass.
3. **Fog và mist:**
   - Fog thành **phối cảnh không khí xanh nhạt** (`skyLow` pha `cloud`), không còn màu giấy.
   - Dưới 120 m gần như trong suốt. Mist mặt đất gần như tắt.
   - Giữ nguyên API `fogAt`.
4. **Ramp:**
   - Giữ 4 bậc mềm.
   - Vùng tối màu xanh lạnh, không xám bẩn; vùng sáng hơi ấm.
   - Tương phản đủ để đọc rõ bóng đổ.
5. **Bench style frame** (`tools/styleframes`) vẫn chạy được cả A, B, C và R.

### Test thay mắt

- Sau pass, một vật xanh lá ở 40 m vẫn giữ ≥ 85 % độ bão hoà gốc.
- Màu fog ở t = 0,3 và t = 0,9 gần `skyLow`/`cloud` hơn là gần `paper`.
- Khi preset R tắt grain, pass không đọc texture giấy.
- Các test cũ cho A, B, C giữ nguyên.
