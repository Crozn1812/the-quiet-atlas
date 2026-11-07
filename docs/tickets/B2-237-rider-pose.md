## TICKET B2-237: tư thế người lái xe GD110 + xuống xe

- Đọc `_ux-common.md`, `_dirA-common.md`, spec §6 (xe), CLAUDE.md "không logo/thương hiệu".
- Được sửa: `src/features/world/vehicle/*`, `src/features/world/character/*`, phần gắn nhân vật lên xe trong `src/features/vehicle/*` nếu cần; test liên quan. **Không** sửa camera (B2-238 làm).
- Công cụ duyệt: build + `node tools/serve-out/index.mjs out --port 4180`; `node tools/review/extras-shots.mjs <dir>` (khung `x09-mounted`, `x10-riding`, `x12-cruise`, `x13-dismount`).

### Hiện trạng
`docs/showcase/29-hoan-thien/hien-trang/ride.webp`, `secret-ride.webp`: khi lên xe chỉ thấy **một khối áo trắng chìm vào yên**, không thấy đầu, tay, chân. Sau khi phanh (S) rồi bấm E, ảnh `dismount.webp` vẫn hiện "E — Xuống xe" (chưa xuống được).

### Việc
1. Người lái ngồi đúng trên yên: hông ở yên, lưng hơi nghiêng trước, hai tay nắm ghi-đông, chân đặt ở gác chân; đầu và vai nhô trên xe, nhìn rõ từ camera sau lưng. Dùng xương của rig hiện có (đặt pose tĩnh "ride" bằng xoay xương hoặc clip có sẵn); không thêm asset mới nặng.
2. Khi đứng yên trên xe có thể chống một chân; khi chạy hai chân lên gác chân. Bánh xe quay theo tốc độ (nếu chưa có).
3. Xuống xe: sau khi phanh dừng (tốc độ ~0) bấm E phải xuống được nếu có chỗ an toàn; nếu không xuống được, hiện lý do ngắn (đã có chuỗi i18n thì dùng, chưa có thì thêm vi/en) thay vì im lặng.

### Test
- Unit: khi `mode = ride`, các xương hông/tay/bàn chân nằm trong hộp yên/ghi-đông/gác chân (sai số vài cm); đầu cao hơn đỉnh ghi-đông.
- Dừng hẳn rồi E → `mode = walk` (khi có chỗ an toàn).
- Test cũ pass. Lead duyệt bằng ảnh.
