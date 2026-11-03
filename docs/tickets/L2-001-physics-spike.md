## TICKET L2-001 — Spike physics + lazy boundary + ADR 0002 nháp

- Trạng thái: **Draft** — chờ P01-A nền và Codex
- Lane / milestone: L2 / B1 (P01-A)
- Mục tiêu: bấm Enter World mới tải chunk 3D; trong cảnh thử có capsule đi trên mặt phẳng + một dốc, so sánh hai phương án collision.
- Spec liên quan: §5 (lazy 3D), §6.1, §15 (quy tắc physics), §16.3 P01-A
- Được sửa: `src/features/world/`, `src/state/`, `docs/adr/0002-physics.draft.md` (chỉ file nháp này)
- Không được sửa: mọi thứ khác; đặc biệt lockfile, `package.json` (cần dependency mới → ghi vào bàn giao để Lead thêm), `src/app/` ngoài điểm gắn đã thống nhất
- Ràng buộc:
  - So sánh Rapier kinematic character controller vs capsule + raycast tự viết: phiên bản, dung lượng gzip, cách khởi tạo (WASM, CSP `'wasm-unsafe-eval'`), slope/autostep/ground snap, chi phí runtime đo được trên máy hiện có (ghi rõ không phải máy tham chiếu).
  - Timestep cố định, giới hạn bước bù khi tab treo.
  - Không lưu state ngoài memory.
- Điều kiện xong: build pass; network trace `/en/` trước Enter World = 0 request chunk 3D/WASM; ADR 0002 nháp có số đo thật.
- Bàn giao: tóm tắt, số đo, đề xuất phương án, việc chưa làm.
