## TICKET B2-162: trời xanh có mây cumulus, mặt trời theo giờ

- Được sửa: `src/features/world/sky/dome.ts`, `src/features/world/sky/grade.ts`, `tests/unit/world/sky.test.ts`.
- Đọc `_dirA-common.md`.

### Việc

1. **Bầu trời:**
   - Gradient từ `skyHigh` ở đỉnh xuống `skyLow` ở chân trời; chân trời sáng hơn.
   - Bờ biển (`coast-dusk`) ngả sang giờ vàng: chân trời là `sunGold` pha `skyLow`, đỉnh trời vẫn xanh.
2. **Mây cumulus trong shader dome.** Không texture tải về, chỉ dùng noise thủ tục.
   - Mảng mây trắng `cloud`, đáy hơi xám xanh, mép mềm kiểu vẽ tay.
   - Tập trung ở dải 5–35° trên chân trời, chiếm khoảng 20–30 % bầu trời.
   - Mây trôi chậm. Khi bật `reducedMotion` thì mây đứng yên.
3. **Mặt trời:**
   - Giữ đĩa mặt trời và quầng sáng của B2-157, đổi màu sang `sunGold`.
   - Rừng buổi sáng: nắng trong, không đỏ.
4. **Lighting grade** theo hướng A:
   - `sunColor`: nắng ấm trắng vàng.
   - `hemiSky`: bầu trời xanh.
   - `hemiGround`: đất phản xạ xanh vàng.
   - Bóng đổ màu xanh lạnh, không đen.

### Test thay mắt

- Ở mẫu có mây, luma của mây cao hơn nền trời ≥ 0,15.
- Trong dải 5–35°, tỉ lệ mẫu có mây nằm trong khoảng 15–35 %.
- Bật reduced motion thì mây đứng yên.
- Chân trời ở biển ấm hơn chân trời ở rừng.
