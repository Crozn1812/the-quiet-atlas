## TICKET HR-HILL — đồi gần Old Trail / First Light như đồi thật
- Lane / milestone: L3 world / B3 đợt siêu thực (ADR 0019)
- Vấn đề: ở góc `old-trail-overview` (ảnh: D:/tqa-worktrees/evidence/HR-FIX-TERRAIN/hr-fix-terrain/after/old-trail-overview.webp) đồi gần là nón cát nhạt trơn với các cụm đá xếp thành hàng ngang đều nhau, và một dải đất đỏ phẳng. Nhìn như mô hình, không như đồi thật.
- Mục tiêu: đồi có lớp phủ thật (cỏ khô, bụi thấp, đất lộ theo rãnh nước chảy), đá phân bố tự nhiên (cụm theo độ dốc, nửa chìm, không thành hàng), chuyển màu theo độ ẩm/độ dốc, silhouette có gờ nhỏ. So với ảnh đồi cỏ khô thật.
- Được sửa: file sinh vị trí đá/bụi trên đồi đó và material/địa hình đồi (tự tìm trong `src/features/world/terrain/` hoặc `zones/`), test unit liên quan.
- Không được sửa: `water/`, `shore/`, `fauna/`, `terrain/spring.ts`, `character/`, `vehicle/`, `props/hr-structures.ts`, `zones/workshop-fire.ts`, `zones/setpiece-hr.ts`, lockfile, docs/.
- Điều kiện xong: lint, typecheck, vitest, build, `E2E_PORT=4203 pnpm exec playwright test tests/e2e/world --workers=2`, check:assets, check:licenses. Ảnh Edge GPU High trước/sau cùng góc (old-trail-overview, horizon-left-holes, first-light-overview) ở `test-results/hr-hill/` + FPS High.
- Bàn giao: tóm tắt, lệnh + output thật, ảnh, việc chưa làm. Không commit.
