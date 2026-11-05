## TICKET B2-196: cây vòm lối rừng (trail canopy) bị to, nghiêng, nhạt như cột sương

- Được sửa: `src/features/world/foliage/scatter.ts` (**chỉ** phần chọn/đặt cây `trailCanopy`), test scatter/foliage liên quan.
- Đọc `_dirA-common.md`, `_asset-common.md`. Ảnh: `docs/showcase/26-asset-ky/lead-review/t10a-sheet.webp` hàng trên.

### Lead thấy

- Gần First Light và dọc lối rừng có vài thân cây **rất to, nghiêng chéo cả khung hình**, phần trên chìm trong sương nên nhạt như cột khói. Nhìn như lỗi, không như vòm cây.

### Việc

- Cây vòm lối: cao 12–16 m, đường kính thân ≤ 1,4 lần cây thường, nghiêng ≤ 6°; tán vươn qua lối nhưng thân đứng cách mép lối ≥ 2,5 m.
- Không đặt cây vòm trong 12 m quanh điểm spawn (camera mở đầu).
- Số lượng giữ nguyên hoặc ít hơn.

### Test

- Mọi cây `trailCanopy`: scale/heightScale/lean trong giới hạn trên; khoảng cách thân → tâm lối ≥ PATH_WIDTH/2 + 2,5 m; không cây nào trong 12 m quanh `pathPointAt(0)`.
- Test foliage cũ pass.
