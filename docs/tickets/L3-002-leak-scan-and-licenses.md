## TICKET L3-002 — Quét rò rỉ §4.6 + kiểm `LICENSES.csv`

- Trạng thái: **Done — merged vào main** (2026-11-03)
- Lane / milestone: L3 / A1
- Mục tiêu: PR fail khi `src/content/` hoặc artifact build (`out/`) chứa thông tin nhạy cảm theo §4.6, hoặc khi có file asset public không có dòng trong `assets/LICENSES.csv`.
- Spec liên quan: §4.6, §7.3 (inventory asset), §11.6 (pipeline PR), Q17
- Được sửa: `tools/scan-leaks/`, `tools/check-licenses/`, `tests/unit/tools/`, `.github/workflows/pr.yml`, `.gitleaks.toml` (gốc repo, chỉ file này)
- Không được sửa: mọi thứ khác; đặc biệt `package.json`, `pnpm-lock.yaml`, `src/`, `docs/`. Cần script `package.json` → ghi vào bàn giao để Lead thêm.
- Ràng buộc:
  - `tools/scan-leaks/`: Node ESM thuần, không dependency mới. Quét file văn bản trong các thư mục truyền vào (mặc định `src/content` và `out`). Luật:
    1. AWS account ID: 12 chữ số đứng riêng (có ranh giới từ), loại trừ khi nằm trong hash/integrity rõ ràng (chuỗi base64/hex dài hơn) — ghi rõ heuristic.
    2. Chuỗi `arn:aws:`.
    3. GUID dạng Azure subscription/tenant (8-4-4-4-12 hex) — chỉ báo khi gần từ khóa `subscription|tenant|directory` trong ±80 ký tự, để tránh nhầm ID ngẫu nhiên.
    4. IP nội bộ (10/8, 172.16/12, 192.168/16) và domain nội bộ (`.internal`, `.local`, `.corp`, `.lan`).
    5. Danh sách cấm tên khách hàng/đối tác + email đồng nghiệp: đọc từ file cấu hình **ngoài repo** qua biến môi trường `TQA_DENYLIST_FILE` (repo public — không commit danh sách thật). Không có biến → bỏ qua luật 5 và in cảnh báo.
    6. Email: mọi địa chỉ email khác allowlist trong `tools/scan-leaks/allowlist.json` (allowlist ban đầu: email liên hệ đang dùng trong `src/content/index.ts`).
    - Exit 1 khi có phát hiện; in file:dòng và luật, **che** giá trị (chỉ in vài ký tự đầu).
  - `.gitleaks.toml`: mở rộng ruleset mặc định (`[extend] useDefault = true`) + các luật 1–4 dạng regex. Workflow chạy gitleaks bằng binary/action ghim phiên bản trên `out/` và `src/content/`.
  - `tools/check-licenses/`: liệt kê mọi file trong `public/` (trừ `.gitkeep`) và fail nếu không có dòng khớp cột `file` trong `assets/LICENSES.csv`, hoặc dòng thiếu cột `license`/`web_distribution_allowed`. Hiện `public/` rỗng → PASS.
  - Workflow `pr.yml`: thêm bước scan-leaks và check-licenses sau build. Giữ `permissions: contents: read`, không secret.
  - Unit test với fixture (gồm fixture "bẩn" cho từng luật 1–4, 6 và fixture asset thiếu license) trong `tests/unit/tools/`.
- Điều kiện xong:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` exit 0
  - `node tools/scan-leaks/index.mjs src/content out` exit 0 trên code hiện tại (nếu có phát hiện thật → báo Lead, không tự sửa nội dung)
  - `node tools/check-licenses/index.mjs` exit 0
  - gitleaks local: NOT RUN nếu không có binary (không tải về); workflow GitHub: NOT RUN (chưa có remote)
  - Một commit trên nhánh (subagent commit được)
- Bàn giao: tóm tắt, output hai tool, lệnh + exit code, script `package.json` đề xuất, việc chưa làm.
