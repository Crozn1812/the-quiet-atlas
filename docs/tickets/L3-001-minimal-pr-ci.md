## TICKET L3-001 — CI PR tối thiểu

- Trạng thái: **Draft** — chờ P01-A nền
- Lane / milestone: L3 / A1 + P01-A
- Mục tiêu: mỗi PR tự chạy lint, typecheck, unit test, build và kiểm "0 chunk 3D trước Enter World".
- Spec liên quan: §5, §8 (ngân sách tải), §11.6, Q18
- Được sửa: `.github/workflows/`, `tools/check-bundle/`, `tests/`
- Không được sửa: mọi thứ khác; đặc biệt lockfile, `package.json`, `src/`
- Ràng buộc:
  - Install theo lockfile (`pnpm install --frozen-lockfile`), có cache.
  - Script kiểm bundle đọc output `out/` + manifest build, fail nếu HTML/JS của `/`, `/en/`, `/vi/`, `/*/quick/` tham chiếu chunk thuộc `features/world` hoặc file `.glb`/`.wasm`/texture game; in tổng dung lượng gzip JS/initial transfer so với §8 (≤ 150 KB JS gzip, ≤ 1 MB).
  - Workflow PR không có quyền cloud, không secret.
- Điều kiện xong: workflow chạy xanh trên nhánh thử; một commit cố ý import `features/world` vào layout làm job fail.
- Bàn giao: tóm tắt, link run, việc chưa làm (gitleaks, LICENSES check, Playwright để ticket sau).
