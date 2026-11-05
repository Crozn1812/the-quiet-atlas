## TICKET B2-157: hoàng hôn trong, ấm, có mặt trời (bỏ màn sữa ở bờ biển)

- Được sửa: `src/features/world/sky/dome.ts`, `src/features/world/sky/grade.ts`, `src/features/world/art/direction.ts` (chỉ phần fog/mist theo vị trí), `src/features/world/scene/paper.ts` (chỉ cách đặt mist theo grade), và test của chúng.
- Đọc `_coast-r2-common.md` mục 1–2.

### Việc

1. **Bờ biển (`coast-dusk`, t ≥ 0,82) bớt sương:**
   - Mist mặt đất và fog gần yếu hẳn. Vật cách 30 m vẫn giữ ≥ 75 % độ tương phản màu gốc. Đường chân trời biển vẫn hơi mờ.
   - Tham số theo vị trí: rừng giữ nguyên. Chỉ sương trên **núi bên trái** (mesh `coast-mountain-mist` đã có) được dày.
2. **Đĩa mặt trời và quầng sáng trong sky dome:**
   - Đĩa nhỏ (≈ 1,5–2,5° góc), màu ấm từ `dusk`/`flower`.
   - Quầng sáng loang rộng ≈ 25–35° quanh mặt trời, đậm nhất sát chân trời.
   - Lấy hướng từ `grade.sunDirection` (đã ở bên phải, thấp trên biển). Không hardcode.
   - Ngoài vùng biển, quầng mờ dần về 0, để rừng/đồi không bị ám.
3. **Bầu trời bờ biển không còn một mảng be phẳng:** gradient rõ từ chân trời cam hồng nhạt lên đỉnh trời tím xanh nhạt.

### Test thay mắt

- Ở t = 0,9: hệ số mist/fog-near tại 30 m ≤ 25 % so với ở rừng; fog far ≥ 380 m.
- Màu sky dome theo hướng mặt trời (cao 3°) ấm hơn và sáng hơn ở hướng ngược lại; độ chênh luma ≥ 0,08.
- Ở t = 0,3 (rừng) không đổi so với trước (snapshot số).
