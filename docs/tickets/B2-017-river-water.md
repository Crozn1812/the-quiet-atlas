## TICKET B2-017 — Mặt nước suối (dải lụa) + biển

- Trạng thái: Assigned → Codex, đợt 15b, nhánh `lane/B2-017`
- Đọc trước: `docs/tickets/_common-b2.md`; `src/features/world/layout/river.ts`; `src/features/world/art/palette.ts`
- Spec: §7.4 (Nước: Low shader đơn giản, Balanced phản chiếu giả, High đầy đủ), §2.1 (suối là trục chính); taste brief §5.2 ("suối là dải lụa uốn chữ S"), §5.3 (nước `#2E5E73`, chàm `#23476B`)
- Việc: `src/features/world/water/`:
  1. `ribbon.ts`: dải mesh dọc spline suối, rộng 4 → 10 m (hẹp ở rừng, rộng gần biển), y = mặt nước (hằng số, khớp `terrain/height.ts`), UV dọc chiều dài.
  2. `material.ts`: `createWaterMaterial(quality)` — ShaderMaterial nhỏ: màu trộn `water` → `indigo` theo khoảng cách tới tâm dải (giữa sẫm, mép sáng), vệt sáng dọc dòng chảy kiểu nét cọ (sọc mềm theo UV.y, trôi chậm theo thời gian **0,05 m/s**, reduced motion → đứng yên), fog tương thích (`fog: true`, include fog chunks). Balanced: thêm "phản chiếu giả" = pha màu trời (`paper`/`dusk` theo uniform) ở góc nhìn sượt (fresnel rẻ). High: + gợn nhẹ normal thủ tục. Low: chỉ màu + sọc tĩnh.
  3. `sea.ts`: mặt biển phẳng lớn ở cuối tuyến (biome coast), cùng material với tham số khác (màu `indigo` pha `dusk`).
  4. `setTime(seconds)`, `setReducedMotion(bool)`, `dispose()`.
- Được sửa: `src/features/world/water/**`, `tests/unit/world/water.test.ts`
- Test: ribbon bám spline (tâm dải cách `riverPointAt` < 0,05 m tại 50 mẫu); bề rộng tăng đơn điệu theo t; reduced motion không đổi uniform thời gian; define đúng theo quality; dispose.
