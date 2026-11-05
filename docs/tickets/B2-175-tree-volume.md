## TICKET B2-175: tán cây lá rộng tròn khối, thân cây màu gỗ tự nhiên

- Được sửa: `src/features/world/foliage/shapes.ts`, `src/features/world/foliage/instances.ts` và test foliage.
- Đọc `_forest-common.md` và `_dirA-common.md`.

### Lead thấy trên ảnh

- **Tán lá rộng là các tấm phẳng như cái ô:**
  - nhìn từ dưới là các đĩa lớn nằm ngang;
  - nhìn ngang là các "cây kẹo mút": thân dài, trên đỉnh có vài đĩa.
  - Chưa ra khối lá tròn, dày như ảnh rừng của Duy.
- **Thân cây:** đa số nhạt gần trắng xám, nhưng vài thân lại đen tuyền (thân phía khuất nắng).

### Việc

1. **Tán lá rộng:**
   - Mỗi tán gồm 4–7 khối lá tròn (icosphere hoặc khối vát nhiều mặt, dẹt tối đa 30 %), chồng lên nhau thành vòm.
   - Tán chiếm 45–60 % chiều cao cây, bắt đầu từ khoảng 40 % chiều cao thân. Không còn thân trơn dài 70 %.
   - Mép tán có vài khối nhỏ lòi ra, cho bóng nắng lọt thành đốm.
   - Ít nhất 3 biến thể.
   - Dây leo của B2-166 vẫn rủ từ đáy tán.
2. **Thông:** các tầng cành dạng nón xếp chồng có độ dày (không phải đĩa mỏng), ngọn nhọn.
3. **Màu thân:**
   - Màu gỗ nâu xám (`rock`, `rockDark` pha một chút `dusk`); rêu xanh ở gốc.
   - Sau ramp, cả mặt khuất nắng cũng có luma ≥ 0,15, mặt hướng nắng ≤ 0,55.
4. **Ngân sách:** mỗi cây gần ≤ 600 tam giác, draw call không đổi.

### Test

- Tỉ lệ cao/rộng tán.
- Không có mặt tán nào là đĩa phẳng: mỗi khối có bề dày ≥ 0,5 × bề ngang.
- Luma thân ở hai phía.
- Ngân sách.
- Tất định.
