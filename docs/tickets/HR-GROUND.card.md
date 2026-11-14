## TICKET HR-GROUND — Mặt đất đồi, đồng cỏ, bãi cát thành bề mặt thật (đọc HR-common.md trước)

- Lane / milestone: L3 World / B3 hyper-real.
- Hiện trạng (ảnh `D:/tqa-worktrees/W-D/test-results/hr-far/b-production-final/1600x900-high-horizon-far.png`): sườn đồi Horizon và nền đồng cỏ là **mặt phẳng màu xanh vàng pastel trơn**, không thấy đất, sỏi hay thay đổi sắc độ lớn. Nhìn từ xa giống tấm nhựa. Vách dốc đã được HR-TERRAIN-CLIFF làm; ticket này lo phần mặt nền thoải.
- Việc:
  1. Vật liệu nền theo sinh cảnh, dùng texture CC0 có normal/roughness, trộn bằng mask theo độ dốc, độ cao, độ ẩm (gần suối/biển) và noise lớn:
     - đồi khô: cỏ cháy vàng xen đất đỏ, sỏi;
     - đồng cỏ: cỏ xanh đậm nhạt loang;
     - ven rừng: đất mùn, lá mục;
     - bãi biển: cát ướt và khô, vệt sóng.
  2. Biến thiên màu cỡ lớn (10–50 m) để xóa cảm giác một màu: mảng cỏ úa, vệt đất lộ, lối mòn tự nhiên. Không có ô lặp nhận ra được ở 30 m.
  3. Chuyển tiếp mềm giữa các vùng và với vách đá đã có (khớp vật liệu `terrain/**` của HR-TERRAIN-CLIFF, không phá).
  4. Giữ chiều cao, collider, đường đi. Low và renderer phần mềm có thể giữ vật liệu cũ.
- Được sửa: `src/features/world/terrain/**` (phần vật liệu nền), `src/features/world/materials/**`, `public/world/tex/` (thêm), `assets/LICENSES.csv`, test. **Không sửa** `foliage/**`, `props/**`, `zones/*-dressing.ts` (HR-PROPS2 đang làm), `sky/**` (HR-SKY), `scene/far-*`, `vehicle/**`, `post/**`.
- Hiệu năng: High ≥ 60 FPS RTX 3060; ghi số trước/sau.
- Xong khi:
  - gate PASS;
  - build 1 lần **sau thay đổi cuối**, rồi e2e world `--workers=2` 43/43 trên build đó;
  - có ảnh High trước/sau cùng góc ở 8 khu và 1 ảnh từ đỉnh đồi Horizon nhìn xuống;
  - `check:assets` và `check:licenses` PASS.
- Không commit.
