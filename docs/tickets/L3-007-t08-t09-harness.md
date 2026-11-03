## TICKET L3-007 — Harness T08 (frame time) và T09 (ổn định) + e2e overlay nội dung (P01-E)

- Trạng thái: **Assigned → subagent Claude** (đợt 7, 2026-11-04), nhánh `lane/L3-007`, worktree `D:/tqa-worktrees/L3-007`
- Lane / milestone: L3 / B1 (P01-F)
- Mục tiêu: đo T08/T09 theo đúng phương pháp §8 trên máy tham chiếu ADR 0007 và có e2e cho interaction/overlay vừa merge ở đợt 6.
- Spec liên quan: §8 (Low quality: FPS TB ≥ 30, p95 ≤ 50 ms, ≤ 1 % frame > 100 ms; không frame > 250 ms trong đoạn ổn định; warm-up 30 s, tuyến cố định 60 s, 3 lần, đánh giá từng lần; stability 10 phút + 20 vòng mở/đóng), §13 T07, T08, T09, Q15; ADR 0007, ADR 0008
- Được sửa: `tests/perf/` (file mới), `tests/e2e/` (file mới), `tools/frame-budget/` (mới), `tests/unit/tools/`, `docs/evidence/B1/` (file kết quả mới)
- Không được sửa: `src/`, `package.json`, lockfile. Lỗi sản phẩm → `test.fail()` + báo Lead.
- Ràng buộc:
  - Frame time đo trong trang bằng `requestAnimationFrame` (delta giữa các frame) — không phụ thuộc hook nội bộ; nếu world có `__tqaPerf` (L2-007, có thể chưa merge) thì đọc thêm `info()` để ghi draw calls/geometry/texture, không có thì ghi NOT RUN cho phần đó.
  - Điều khiển tuyến cố định bằng phím thật (W + ← theo lịch thời gian) qua Playwright. Headless không có focus nên world pause → **chạy headed** Edge (`headless: false`) cho T08/T09, ghi rõ. Màn hình máy dev, DPR thực, quality **Low** (chọn qua menu) và Balanced (tham khảo).
  - T08: warm-up 30 s → ghi 60 s; 3 lần; mỗi lần tính FPS trung bình, p95, % frame > 100 ms, số frame > 250 ms; gate theo **từng lần** (§8). Xuất CSV frame time vào `test-results/frame-budget/` và bảng vào `docs/evidence/B1/t08-<ngày>.md`. Không đổi ngưỡng.
  - T09: 10 phút di chuyển + 20 vòng mở/đóng menu (và overlay nếu có); ghi JS heap (`performance.memory` nếu có), số canvas, và `info()` nếu có, theo mốc; kết luận "ổn định / tăng liên tục" theo xu hướng sau warm-up. Có thể đặt timeout dài, chạy riêng bằng biến môi trường `PERF_LONG=1`.
  - e2e overlay (P01-E, headless): đi tới bàn Workshop (hoặc mô phỏng bằng dispatch `tqa:open-content` nếu không lái được tới) → overlay mở, `paused="true"`, focus tiêu đề; Esc đóng → focus trả, `paused="false"`; khu chưa có dữ liệu → "đang xây dựng". Bỏ `test.fail()` skip link nếu L1-006 đã sửa và test đạt.
  - Q15: giả lập `webglcontextlost` (extension `WEBGL_lose_context`) → UI đưa đường về HTML ≤ 2 s (nếu L2-007 đã có event; chưa có thì `test.fail()` có ghi chú).
- Điều kiện xong: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` exit 0; chạy T08 3 lần (headed) + T09 một lần, có file evidence; một commit.
- Bàn giao: bảng T08 từng lần PASS/FAIL, T09 xu hướng, e2e overlay, Q15, lệnh + exit code, giới hạn.
