## TICKET HR-SETPIECE-B — lửa thật, khung chòi Quiet Shore, gương thật
- Lane / milestone: L3 world / B3 đợt siêu thực (ADR 0019)
- Nối tiếp HR-FIX-SETPIECE (merge 08c5805). Worktree: D:/tqa-worktrees/W-G, nhánh lane/HR-SETPIECE-B. E2E_PORT=4207.
- Mục tiêu:
  1. Lửa ở xưởng: lõi hiện là cột trắng cháy sáng. Cần lửa thật: lõi vàng cam, lưỡi lửa tách, chập chờn, có than đỏ và khói mỏng; không có cột trắng khi bloom bật.
  2. Khung chòi Quiet Shore (`props/hr-structures.ts`): cột, mái, sàn còn là hộp phẳng. Cần gỗ thật có vân, mối nối, mái tôn/lá có độ võng, mép mòn.
  3. Gương xe: hiện chỉ là shader trên đĩa phẳng. Cần mặt gương có vỏ nhựa và viền, phản chiếu đúng.
- Được sửa: `src/features/world/zones/workshop-fire.ts`, `src/features/world/props/hr-structures.ts`, `src/features/world/vehicle/hr-runtime.ts`, `src/features/world/zones/setpiece-hr.ts`, test unit liên quan, `tools/assets/blender/hr-setpiece-b-*`, asset mới trong `public/world/lib/` + `assets/LICENSES.csv` + manifest.
- Không được sửa: `water/`, `shore/`, `fauna/`, `terrain/`, `scene/far-*`, `character/` (ticket khác đang làm), lockfile, docs/.
- Ràng buộc: asset chỉ CC0/giấy phép rõ, mỗi file có dòng LICENSES.csv; không logo; không lưu progress; budget chỉ báo cáo (ADR 0019).
- Điều kiện xong: lint, typecheck, vitest, build, `E2E_PORT=4207 pnpm exec playwright test tests/e2e/world --workers=2`, check:assets, check:licenses. Ảnh Edge GPU High cùng góc trước/sau (workshop-close, quiet-shore-close, ảnh gương xe) ở `test-results/hr-setpiece-b/`.
- Bàn giao: tóm tắt, lệnh + output thật, ảnh, việc chưa làm. Không commit.
