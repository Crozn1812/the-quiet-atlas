## TICKET L3-001 — CI PR tối thiểu + kiểm "0 chunk 3D trước Enter World"

- Trạng thái: **Assigned → subagent Claude** (2026-11-03), nhánh `lane/L3-001`, worktree `../tqa-L3`
- Lane / milestone: L3 / A1 + P01-A
- Mục tiêu: mỗi PR tự chạy lint, typecheck, unit test, build và kiểm bundle; dev chạy được cùng kiểm tra đó ở local.
- Spec liên quan: §5, §8 (ngân sách tải), §11.6, Q18
- Được sửa: `.github/workflows/`, `tools/check-bundle/`, `tests/tools/`
- Không được sửa: mọi thứ khác; đặc biệt `package.json`, `pnpm-lock.yaml`, `src/`, `docs/`. Cần thêm script vào `package.json` thì ghi vào bàn giao để Lead thêm.
- Hợp đồng ranh giới (từ L2-001): điểm vào world chứa chuỗi `__TQA_WORLD_CHUNK__`.
- Ràng buộc:
  - `tools/check-bundle/` là script Node thuần (ESM, không dependency mới), chạy sau `next build` trên thư mục `out/`:
    1. Với mỗi trang không-world (`out/index.html`, `out/{en,vi}/index.html`, `out/{en,vi}/quick/index.html` nếu có, `out/404.html`): thu thập JS/CSS/font/ảnh được tham chiếu trực tiếp trong HTML (script src, link rel=preload/modulepreload/stylesheet, img).
    2. Fail nếu bất kỳ JS nào trong tập đó chứa `__TQA_WORLD_CHUNK__`, hoặc HTML tham chiếu `.glb`, `.gltf`, `.wasm`, `.ktx2`, `.basis`.
    3. Tính tổng gzip (zlib của Node) JS và tổng initial transfer mỗi trang; fail nếu JS > 150 KB gzip hoặc tổng > 1 MB (§8). In bảng kết quả.
    4. Exit code khác 0 khi fail.
  - Unit test cho script bằng fixture HTML/JS nhỏ trong `tests/tools/` (vitest đã có; include pattern hiện tại là `tests/unit/**` — đặt test ở `tests/unit/tools/` cho khớp).
  - `.github/workflows/pr.yml`: trigger `pull_request` và `push` lên `main`; Node 24 LTS hoặc khớp `engines`; pnpm qua `pnpm/action-setup` ghim version; `pnpm install --frozen-lockfile` có cache; chạy lint → typecheck → test → build → check-bundle. `permissions: contents: read`. Không secret, không quyền cloud. Ghim action theo commit SHA hoặc tag chính.
- Điều kiện xong:
  - Chạy local: `pnpm build` rồi `node tools/check-bundle/index.mjs out` exit 0 trên code hiện tại.
  - Chứng minh fail đúng: tạo fixture có chuỗi marker → test fail-case pass.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` exit 0.
  - Workflow chưa chạy được trên GitHub vì repo chưa có remote → ghi NOT RUN, không ghi PASS.
  - Một commit trên nhánh, conventional commit message.
- Bàn giao: tóm tắt, output bảng check-bundle, việc chưa làm (gitleaks, LICENSES check, Playwright → ticket sau).
