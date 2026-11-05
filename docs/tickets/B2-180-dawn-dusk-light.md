## TICKET B2-180: rừng là bình minh le lói, biển là hoàng hôn (đang sáng như giữa trưa)

- Được sửa:
  - `src/features/world/sky/grade.ts`
  - `src/features/world/sky/dome.ts`
  - `src/features/world/art/direction.ts` (**chỉ** fog/mist/sky của preset R)
  - `src/features/world/scene/compose.ts` (**chỉ** hàm `directGrade` và các hằng màu trời/fog)
  - test liên quan (`sky`, `direction`, `compose`, `paper`)
- Đọc `_dirA-common.md`.

### Duy (2026-11-05)

> Đúng ý rồi. Nhưng theo spec V6, khu rừng là **bình minh le lói** nên hiện hơi sáng. Ra đường bờ biển là **hoàng hôn** nên cũng sáng quá.

### Spec V6

- §1, §2: "đi từ rừng bình minh ra biển hoàng hôn".
- §6 dòng 303: "Ánh sáng bình minh → hoàng hôn chuyển theo vị trí trong thế giới… Fog, màu ánh sáng và bầu trời thống nhất; có vùng chuyển tiếp tránh đổi màu đột ngột khi quay đầu."

### Hiện trạng (`sky/grade.ts`)

| Đoạn | Cường độ nắng | Hemi | Hướng nắng |
|---|---|---|---|
| Rừng | 2,3 | 1,0 | cao khoảng 11° |
| Đồi | 2,8 | 2,0 | gần đỉnh đầu |
| Biển | 1,7 | 0,95 | cao khoảng 8° |

Trời xanh trưa ở cả ba đoạn. Trên ảnh, cả rừng lẫn biển đều sáng như buổi trưa.

### Mục tiêu

1. **Rừng (`forest-dawn`): bình minh le lói.**
   - Mặt trời rất thấp, cao 3–7°, phía đông, sau rừng; chỉ lọt qua tán thành vệt và đốm.
   - Nắng vàng hồng nhạt (`sunGold` pha `flower` rất ít). Cường độ nắng giảm khoảng 40 %.
   - Ambient/hemi giảm khoảng 45 %, bóng xanh lạnh.
   - Trời: chân trời hồng đào nhạt pha vàng, lên đỉnh là xanh xám nhạt. Mây có viền nắng ấm.
   - Sương rừng giữ hoặc tăng nhẹ (sương sớm), màu hơi ấm ở phía mặt trời.
   - Luma trung bình của cảnh khoảng **0,26–0,32** (hiện khoảng 0,45).
2. **Đồi giữa (`hill`): buổi sáng muộn, trong**, sáng nhất world nhưng không gắt. Hemi giảm khoảng 20 %.
3. **Biển (`coast-dusk`): hoàng hôn.**
   - Mặt trời cao 2–5° trên biển, bên phải phía trước (giữ hướng hiện tại, hạ độ cao).
   - Nắng cam vàng (`sunGold` pha `flower` khoảng 30 %). Bóng dài.
   - Trời: chân trời cam hồng rực quanh mặt trời, lên đỉnh là xanh tím đậm (`skyHigh` pha `indigo`). Mây đáy hồng cam.
   - Ambient giảm khoảng 40 %, vùng khuất nắng ngả tím xanh.
   - Biển phản chiếu vàng cam (đọc `sunColor` hiện có).
   - Luma trung bình khoảng **0,24–0,30**.
4. **Chuyển tiếp mượt** theo vị trí: rừng → đồi trong khoảng 40 m đường đi, đồi → biển theo cửa sổ hiện có. Không đổi màu đột ngột khi quay đầu.
5. **Vẫn đọc rõ:**
   - Vật trong khu (bàn, hộp thư, đá) ở 15 m có luma ≥ 0,12.
   - Gợi ý E và overlay là HTML nên không bị ảnh hưởng.
6. **Cinematic:** intro bình minh và ending hoàng hôn đọc từ grade này; kiểm test của chúng.

### Test thay mắt

Tính trên CPU (sun × max(0, N·L) + hemi) cho mặt đất phẳng và một mặt đứng:

- Rừng t = 0,15: luma ước lượng trong 0,26–0,32; độ cao mặt trời 3–7°.
- Biển t = 0,93: luma 0,24–0,30; độ cao 2–5°; màu nắng có R/B ≥ 1,5.
- Đồi t = 0,55: sáng hơn cả rừng lẫn biển.
- Chuyển tiếp: giữa hai mẫu t cách nhau 0,005, chênh luma ≤ 0,02.
- Trời: chân trời rừng có R > B; đỉnh trời biển có B > R; quầng mặt trời biển ấm hơn quầng rừng.
- Các test cũ pass; đổi kỳ vọng thì ghi lý do.
