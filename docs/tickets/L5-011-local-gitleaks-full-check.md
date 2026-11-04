## TICKET L5-011 — gitleaks chạy được ở local + danh sách "kiểm full" có Lighthouse

- Trạng thái: **Assigned → subagent L5** (2026-11-04, đợt 11), nhánh `lane/L5-011`, worktree `D:/tqa-worktrees/L5-011`
- Lane / milestone: L5 Platform / A1 (chất lượng CI)
- Bối cảnh: CI run #2–#3 đỏ ở gitleaks vì máy local không chạy được gitleaks (Docker Desktop hỏng) → Lead phải đoán. Lead đã tải gitleaks v8.28.0 chính thức (checksum khớp) vào thư mục tạm. Đợt 5–10 bỏ sót hồi quy Lighthouse vì danh sách kiểm full thiếu `perf:lhci`.
- Việc:
  1. `tools/checks/gitleaks.mjs`: chạy đúng 3 lệnh như CI (`dir out`, `dir src/content`, `git .` với `--config .gitleaks.toml --redact --no-banner --exit-code 1`) bằng binary ở `$GITLEAKS_BIN`; thiếu biến → in hướng dẫn và exit 2 (BLOCKED, không phải PASS). Không tải gì từ mạng.
  2. `docs/runbook/full-check.md`: danh sách kiểm full sau mỗi đợt merge, theo thứ tự: lint, typecheck, test, build:artifacts, check:cv, check:bundle, check:leaks, check:licenses, gitleaks (script trên), test:e2e, test:perf, **perf:lhci** (với `CHROME_PATH` Edge). Ghi rõ lane nào chạy (L4) và Lead chạy lại gì.
  3. Đề xuất (không tự sửa) cho Lead: thêm script `check:gitleaks` vào `package.json`.
- Được sửa: `tools/checks/`, `docs/runbook/`, `.github/` (chỉ nếu cần)
- Không được sửa: `src/`, `tests/`, `package.json`, lockfile, config gốc, docs khác
- Điều kiện xong: chạy `GITLEAKS_BIN=<đường dẫn Lead đưa> node tools/checks/gitleaks.mjs` exit 0 trên main; chạy không có biến → exit 2 với thông báo rõ. Dán output. Không commit.
