## TICKET HR-WATER-B — bọt sóng thật, thác mạch nguồn, chim thật
- Lane / milestone: L3 world / B3 đợt siêu thực (ADR 0019)
- Nối tiếp HR-FIX-WATER. Worktree: D:/tqa-worktrees/W-F, nhánh lane/HR-WATER-B. E2E_PORT=4206.
- Mục tiêu (theo ảnh Lead xem, so với ảnh thật):
  1. Bọt sóng (A20): ở góc `surf-shore` giờ là một dải trắng rộng có vân loang như sơn đổ trên cát. Bọt thật là lưới ren mảnh, đứt đoạn, chạy song song mép sóng, mỏng dần khi nước rút; cát ướt sẫm và bóng sau mép. Không có dải sáng liền.
  2. Thác mạch nguồn (A23): còn là tấm phẳng có hoa văn. Cần nhiều dải nước tách rời, trong, có khúc xạ và highlight, mép rách, bụi nước ở chân.
  3. Chim (A25): còn như thú bông. Tìm mesh/texture chim CC0 hoặc giấy phép rõ (ghi LICENSES.csv); nếu không có, làm lông theo lớp với silhouette mảnh hơn, mỏ và chân thật, tư thế đậu thật. Báo nguồn đã tìm.
  4. Cá (phụ): vây trong mờ; thêm góc chụp cận cá trong game (không chỉ harness).
- Được sửa: `src/features/world/shore/`, `src/features/world/water/`, `src/features/world/fauna/`, `src/features/world/terrain/spring.ts`, test unit liên quan, asset mới + LICENSES.csv + manifest.
- Không được sửa: `scene/far-*`, `terrain/cliff*`, `zones/first-light-cliff-detail.ts`, `character/`, `props/hr-structures.ts`, `zones/workshop-fire.ts`, `vehicle/`, lockfile, docs/.
- Điều kiện xong: lint, typecheck, vitest, build, `E2E_PORT=4206 pnpm exec playwright test tests/e2e/world --workers=2`, check:assets, check:licenses. Ảnh Edge GPU High trước/sau cùng góc ở `test-results/hr-water-b/`. FPS nếu GPU bận thì ghi NOT RUN và lý do.
- Bàn giao: như HR-FIX-WATER. Không commit.
