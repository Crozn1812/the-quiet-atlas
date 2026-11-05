## TICKET B2-158: từ đường nhìn thấy vịnh và sóng bên phải

- Được sửa: `src/features/world/terrain/height.ts` và test địa hình/bờ biển (`coast-shape`, `coast`, `terrain-landmarks`, `river-terrain`).
- Đọc `_coast-r2-common.md` mục 3. Quy ước trái/phải: `B2-152b-coast-terrain-mirror.md` (phải = `(−fz, fx)`).

### Việc

1. Đoạn `t` 0,84–0,97, **bên phải** đường:
   - đất hạ dần xuống bãi cát trong **25–45 m** kể từ mép đường; bãi thoải;
   - mép nước vịnh nằm trong khoảng 35–70 m từ đường.
   - Bỏ cao nguyên cỏ rộng hiện tại.
2. **Nền khu Quiet Shore và Last Postcard giữ nguyên:**
   - khu dựng không lỗi, khô;
   - hiên vẫn nhìn ra biển;
   - cột/hiên không treo lơ lửng (test `placeZoneScenes(surfaceHeight)` hiện có).
   - Dùng hạ thấp có mặt nạ quanh nền khu nếu cần.
3. Đường, cầu/ford, khoảng hở so với nước, cửa sông và bờ suối Horizon: giữ như cũ. Núi bên trái giữ như B2-152b.

### Test thay mắt

- Tầm nhìn từ mắt (đường + 1,7 m) ở t = 0,86, 0,9, 0,94:
  - tia hướng sang phải-trước, lệch 30–70° so với hướng đi;
  - tia chạm **mặt nước** (cao độ < 0) trước khi chạm đất cao hơn tia, trong ≤ 120 m.
- Cao độ bên phải 40 m ≤ 1,5 m.
- Mọi test cũ pass. Đổi điểm đo thì ghi lý do.
