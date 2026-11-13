## TICKET PERF-FL03 — Đưa CPU của FL-03 về trần +10 ms/s

Bối cảnh: FL-03 (`cad6ea3`) đã merge với số đo tham khảo **+18 ms/s** script ở First Light so với trước FL-03; trần là main trước đó **+10 ms/s** (ADR 0015). Phần mới của FL-03: `foliage/forest-ceiling.ts`, `post/dawn-shafts.ts`, `water/fish.ts`, `terrain/spring.ts`, `foliage/first-light-grove.ts`.

**Mục tiêu:** giữ nguyên hình (tán kín trời, tia nắng, cá, vách núi), giảm việc mỗi frame trên CPU.

**Cách làm:**
1. Đo trước khi sửa: bản nền đã build sẵn ở `D:/tqa-worktrees/BASE-pre-FL03` (`252772f`). Trong worktree của bạn, build một lần (lệnh WASM ở `_common-b2.md`), rồi serve hai bản ở hai cổng (`node tools/serve-out/index.mjs out --port <cổng>`; build bản nền trước nếu chưa có `out/`). Chạy `node tools/review/cpu-compare.mjs http://127.0.0.1:<cổng>` theo thứ tự A B B A, cả hai lượt.
2. Tìm phần tốn: cấp phát trong vòng lặp (Vector3/Matrix4 tạm), cập nhật instance cả mảng mỗi frame dù không đổi, `needsUpdate` mỗi frame, tính lại uniform không đổi, raycast. Làm theo mẫu RC-10/11/18/21: cache, bỏ cấp phát, cập nhật thưa.
3. Đo lại theo ABBA. Đích: First Light, Roots, Workshop đều ≤ bản nền +10 ms/s script.

**Được sửa:** `src/features/world/foliage/forest-ceiling.ts`, `foliage/first-light-grove.ts`, `post/dawn-shafts.ts`, `water/fish.ts`, `terrain/spring.ts`, test unit tương ứng. **Không** sửa `layout/`, `zones/`, `terrain/height.ts`, `index.ts` (MAP-01 đang làm song song ở đó).

**Điều kiện xong:** `bash tools/lead/gate.sh .` → GATE PASS; bốn dòng output cpu-compare trước sửa và bốn dòng sau sửa (dán nguyên văn); ảnh High First Light trước/sau (`ingame-shots.mjs`) cho thấy hình không đổi; `luma.mjs` lệch ≤ 0,01. Không commit.
