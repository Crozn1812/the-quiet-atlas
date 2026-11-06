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

### Lead trả lời (2026-11-06)

- **Được sửa thêm `src/features/world/foliage/instances.ts`** (B2-194 đã merge): tách thân đứng khỏi tán vươn cho cây vòm (shear chỉ áp phần tán, thân thẳng ≤ 6°).
- Ý đồ giữ nguyên: tán **vẫn vươn che lối** như ảnh rừng của Duy; chỉ thân không được to/nghiêng như cột. Cập nhật test "phủ tâm lối" theo tán vươn (không được giảm về 0/72; mục tiêu ≥ 25/72).
- Worktree cần rebase lên main mới (đã có B2-194). Lead đã rebase.
