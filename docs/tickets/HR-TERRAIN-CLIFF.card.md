## TICKET HR-TERRAIN-CLIFF — Vách dốc của địa hình thành vách đá thật (đọc HR-common.md trước)

- Lane / milestone: L3 World / B3 hyper-real.
- Hiện trạng (ảnh `D:/tqa-worktrees/W-B/test-results/hr-gd110/world-A1/driving.png`, khu First Light gần suối): sườn dốc của địa hình là **một mặt phẳng đứng màu be**, texture bị **kéo dãn thành sọc dọc** (UV chiếu từ trên xuống), chân vách cắt thẳng vào cỏ, không có đá rơi, rễ hay rêu. Nhìn như tường sơn.
- Việc:
  1. Vật liệu địa hình ở chỗ dốc: **triplanar** (hoặc chiếu theo pháp tuyến) cho texture đá CC0 có normal/roughness, có phân lớp đá trầm tích nằm ngang, khe nứt, vệt nước chảy và mảng rêu ở chỗ ẩm. Chuyển dần từ cỏ/đất sang đá theo độ dốc, không có đường cắt thẳng.
  2. Phá mặt phẳng: thêm nhiễu hình học hoặc displacement cho vách (gờ, hõm, mỏm nhô). Đặt các khối đá HR (`hr-rock-*`, `hr-cliff-*` đã có) và đá vụn ở chân vách. Rễ cây và dây leo rủ xuống từ mép trên ở khu rừng.
  3. Áp cho mọi sườn dốc đủ lớn trong world, không chỉ First Light. Liệt kê các chỗ đã kiểm.
  4. Giữ collider và chiều cao địa hình (không đổi gameplay, đường đi và vị trí tương tác). Low và renderer phần mềm có thể giữ vật liệu cũ.
- Được sửa: `src/features/world/terrain/**`, `src/features/world/materials/**`, `zones/first-light-cliff-cull.ts`, `public/world/tex/` (thêm), `assets/LICENSES.csv`, test. **Không sửa** `foliage/**`, `props/**`, `zones/*-dressing.ts` (HR-PROPS2), `scene/far-*` (HR-FAR), `vehicle/**` (HR-GD110), `post/**`.
- Hiệu năng: High ≥ 60 FPS RTX 3060; ghi số trước/sau.
- Xong khi:
  - gate PASS;
  - build 1 lần **sau thay đổi cuối**, rồi e2e world `--workers=2` 43/43 trên build đó;
  - có ảnh High trước/sau cùng góc ở ít nhất 5 vách (gồm góc trong driving.png);
  - `check:assets` và `check:licenses` PASS.
- Không commit.
