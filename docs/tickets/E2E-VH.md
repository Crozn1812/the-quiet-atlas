## TICKET E2E-VH — 3 ca `world-vehicle.spec.ts` fail cả trên main

- Lane / milestone: L4 QA / B3, gate A (CI e2e chạy config mặc định SwiftShader).
- Bối cảnh: GFX-P3 báo `world-vehicle.spec.ts --workers=2` fail 3 ca trên cả nhánh và trên bản build main (cổng 4180): chờ `data-world-build="done"` hoặc chờ xuống xe. GFX-P1 thấy 2 timeout tương tự trên SwiftShader. Máy lúc đó đang chạy 3 worker build song song, nên có thể chỉ là do tải; cũng có thể là lỗi thật sau MAP-01/VH-03/GFX-P4.
- Việc:
  1. Build main **một lần** (lệnh WASM trong `docs/runbook/codex.md`), chạy `world-vehicle.spec.ts` bằng **config mặc định** 3 lượt: `--workers=2` và `--workers=1`. Ghi từng ca PASS/FAIL, thời gian tới `data-world-build=done`.
  2. Đọc trace của ca fail và chỉ ra nguyên nhân gốc: do tải máy (thời gian dao động), do điểm spawn hoặc bãi đỗ xe lệch sau MAP-01 (đổi tỷ lệ world), hay do VH-03 (xe giữ yên khi đứng).
  3. Nếu lỗi nằm ở test (tọa độ cũ, chờ sai sự kiện): sửa test cho đúng hành vi, **không nới timeout**, không bỏ assertion.
  4. Nếu lỗi nằm ở mã app: **không sửa** (vùng xe và `index.ts` đang có ticket khác). Ghi nguyên nhân, file:dòng và bản vá đề xuất vào bàn giao.
- Được sửa: `tests/e2e/world-vehicle.spec.ts`, `tests/e2e/helpers/**` (chỉ khi cần cho ca xe), `tests/e2e/E2E-VH-HANDOFF.md`.
- Không được sửa: `src/**`, config Playwright, lockfile, `docs/`.
- Điều kiện xong: spec xe với config mặc định 3/3 lượt PASS (dán output), hoặc bàn giao có nguyên nhân gốc kèm bằng chứng trace. `bash tools/lead/gate.sh .` → GATE PASS. Không commit.
