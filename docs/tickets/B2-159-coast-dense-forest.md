## TICKET B2-159: rừng núi bên trái khép tán, lớp lớp tới đỉnh

- Được sửa: `src/features/world/foliage/scatter.ts`, `src/features/world/foliage/instances.ts` (nếu cần sức chứa) và test foliage.
- Đọc `_coast-r2-common.md` mục 4. Quy ước trái/phải như B2-152b.

### Việc

1. **Sườn trái** đoạn `t` 0,82–1, cách đường 22 m tới đỉnh và qua đỉnh (≈ 260 m):
   - tán phủ kín, không thấy hàng lối;
   - cây lệch pha, cỡ to nhỏ xen kẽ (0,9–1,5);
   - tầng trên sườn vẫn có cây, không trọc.
2. **Ngân sách:** tổng instance tăng tối đa **+25 %** so với trần hiện có (2 841 trong vùng 240 m). Draw call không tăng. Ghi số trước/sau.
   - Ưu tiên cây ở rìa nhìn thấy từ đường.
   - Bớt cây ở chỗ khuất: sâu trong rừng nội địa, sau đỉnh.
3. Phía biển (bên phải) giữ thoáng như B2-153.

### Test thay mắt

- Mật độ:
  - trên lưới 10 × 10 m ở dải trái 22–200 m, ≥ 85 % ô có ít nhất 1 tán cây phủ (tính theo bán kính tán);
  - dải 200–260 m có cây.
- Không có ≥ 4 cây thẳng hàng cách đều: góc lệch < 3° và khoảng cách lệch < 10 %.
- Tổng instance ≤ trần cũ × 1,25. Draw call không đổi.
