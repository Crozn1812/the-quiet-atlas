## TICKET B2-229b: biển hoàng hôn vòng 2 (hết nan quạt đen, bớt lục gắt)

- Đọc `B2-229-dusk-sea-colour.md`, `B2-219c-water-no-pattern.md` (merge trước). Được sửa: `src/features/world/water/material.ts` (phần SEA), test biển.
- Ảnh trong game: `docs/showcase/27-hoan-thien-1/lead-review/sea-after-229.webp`:
  - xa bờ **gần đen** với các **vệt tối toả hình nan quạt** từ phía camera (dải sáng/tối xen kẽ theo góc nhìn);
  - gần bờ **xanh lục bão hoà gắt**.

### Việc

1. Xa bờ: xanh tím **trung bình** (không đen): luma hiển thị 0,12–0,22 ở hoàng hôn; phản chiếu trời chiều (Fresnel) làm sáng dần về chân trời (chân trời biển gần màu trời).
2. Bỏ nguồn tạo nan quạt: kiểm các hạng mục phụ thuộc hướng nhìn (glitter, wash, gợn) không tạo dải xen kẽ theo góc; nếu do vệt nắng, chỉ trong ±12° về phía mặt trời.
3. Gần bờ: ngọc **tối, bớt bão hoà** (chroma giảm ≥ 30 %).

### Test

- CPU theo lưới góc nhìn từ camera tại Last Postcard (cao 8 m, nhìn ra biển): luma xa bờ 0,12–0,22; dao động luma theo góc phương vị (ngoài hành lang mặt trời) ≤ 0,03 (không nan quạt).
- Chroma gần bờ giảm ≥ 30 % so với hiện tại. Test cũ pass.
