## TICKET B2-242: dải tối dọc vách ở Quiet Shore

- Đọc `_review-common.md` (cổng 4192), `_dirA-common.md`, `docs/art-bible/lighting.md`.
- Được sửa: `src/features/world/terrain/*` (màu/biome vách ven biển), `src/features/world/road/*` (chỉ màu taluy nếu nguyên nhân ở đó), test liên quan.
- Hiện trạng: `docs/showcase/29-hoan-thien/hien-trang/quiet-shore-dai-toi.webp`: mép trái là dải vách/taluy gần đen chạy dọc đường, chiếm 1/4 khung, nặng nề so với hoàng hôn ấm.
- Việc: tìm nguyên nhân (màu `rockDark`, bóng đổ, mặt dốc quay lưng nắng hoàng hôn, hay mặt nước sông tối) bằng raycast giữa dải tối; sửa để vách đọc được (đá ấm trong bóng, có chi tiết), luma Quiet Shore 0,24–0,32, vẫn khác biệt rõ với đường và cỏ.
- Test: unit màu vách trong khoảng; ảnh trước/sau; 8 khu luma.
