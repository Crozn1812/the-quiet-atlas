## TICKET B2-020 — Pipeline asset: Blender headless → glTF → meshopt/KTX2 + báo cáo ngân sách

- Trạng thái: Assigned → Codex, đợt 15, nhánh `lane/B2-020`
- Đọc trước: `docs/tickets/_common-b2.md`, `docs/runbook/asset-tools.md`
- Spec: §7.3 (Blender → glTF → gltf-transform meshopt, KTX2, prune, dedup; ngân sách tam giác + dung lượng mỗi asset; `assets/LICENSES.csv`), §8 (≤ 8 MB bắt đầu chơi, ≤ 30 MB world); ADR 0013 mục 5
- Việc (`tools/assets/`):
  1. `optimize.mjs <in.glb> <out.glb> [--texture=etc1s|uastc|none]`: dùng API `@gltf-transform/core` + `functions` + `extensions` (đã có trong devDependencies, **không thêm** gói): `dedup`, `prune`, `weld`, `simplify` (tùy chọn `--ratio`), `meshopt` (encoder từ gói `meshoptimizer`), `textureCompress`/KTX2 qua `toktx` từ KTX-Software **nếu có trong PATH**; không có → bỏ bước texture và in cảnh báo (không fail). In JSON: số tam giác, số material, số texture, byte trước/sau.
  2. `budgets.json`: ngân sách theo loại asset — `tree` (≤ 1 500 tam giác, ≤ 60 KB), `rock` (≤ 400, ≤ 20 KB), `prop` (≤ 2 000, ≤ 80 KB), `character` (≤ 12 000, ≤ 600 KB), `vehicle` (≤ 8 000, ≤ 400 KB). Ghi chú: giá trị khởi điểm, Perf Watcher chỉnh sau đo.
  3. `check-budgets.mjs [dir=public/world]`: duyệt mọi `.glb` trong thư mục, đọc loại từ tên file (`<type>-<name>.glb`), so với `budgets.json`, kiểm tổng ≤ 30 MB và nhóm "start" (`public/world/start/**`) ≤ 8 MB; exit 1 nếu vượt; thư mục rỗng/không tồn tại → PASS với ghi chú.
  4. `blender/pine.py`: script bpy tạo **một cây thông cách điệu** (thân trụ 6 cạnh + 3 tầng nón lệch nhẹ, low-poly, 2 material màu phẳng lấy giá trị hex từ `src/features/world/art/palette.ts` — copy giá trị vào script, ghi nguồn), xuất `tree-pine.glb`. Chạy: `blender -b --factory-startup -P tools/assets/blender/pine.py -- <out.glb>`. Codex **không cần chạy Blender** (sandbox có thể chặn) — Lead chạy.
  5. `tools/assets/README.md`: lệnh chạy từng bước.
- Được sửa: `tools/assets/**`, `tests/unit/tools/assets.test.ts`
- Test: tạo glTF nhỏ trong bộ nhớ bằng `@gltf-transform/core` (vài tam giác, không texture) → optimize ghi file vào thư mục tạm OS, JSON báo cáo đúng số tam giác; check-budgets: thư mục tạm có file vượt ngân sách → exit code 1, đúng ngân sách → 0, thư mục rỗng → 0; tên file không đúng mẫu → lỗi rõ ràng.
- Không commit file `.glb` nào.
