## TICKET L3-004 — Đo ngân sách tải cold-cache (Q18/§8) + Lighthouse CI

- Trạng thái: **Assigned → subagent Claude** (2026-11-04), nhánh `lane/L3-004`, worktree `D:/tqa-worktrees/L3-004`
- Lane / milestone: L3 / A1 + P01
- Mục tiêu: có phép đo lặp lại được cho các ngưỡng §8 không phụ thuộc GPU, chạy trên `out/` qua `tools/serve-out`.
- Spec liên quan: §8 (bảng ngân sách), §13 Q18, T08 (chỉ phần time-to-playable mạng), ADR 0007
- Dependency: Lead đã thêm `@lhci/cli` (exact) trên `main`. Không tự thêm/đổi.
- Được sửa: `tests/perf/` (mới), `tools/load-budget/` (mới), `lighthouserc.cjs` hoặc `.lighthouserc.json` (gốc, mới), `.github/workflows/pr.yml`, `playwright.config.ts` (chỉ thêm project/testDir cho perf nếu cần), `docs/evidence/A1/` (chỉ file kết quả đo mới do bạn tạo)
- Không được sửa: mọi thứ khác; đặc biệt `package.json`, lockfile, `src/`, `tests/e2e/` hiện có. Script cần thêm → bàn giao.
- Ràng buộc:
  - **Cold-cache trace** bằng Playwright + CDP (`Network.emulateNetworkConditions`: 10 Mbps down, RTT 100 ms; cache tắt), Edge local:
    1. Welcome `/en/` và Quick `/en/quick/`: tổng byte nén thực truyền (dùng `encodedDataLength`/`Network.loadingFinished`) gồm HTML/CSS/JS/font/ảnh — gate ≤ 1 MB, JS ≤ 150 KB gzip (§8; không tính CV).
    2. 0 request GLB/texture/WASM/chunk world trước Enter World.
    3. Từ click Enter World đến "player controllable" (định nghĩa: `data-world-chunk` xuất hiện và canvas đã render ≥ 1 frame — ghi rõ định nghĩa trong báo cáo): tổng byte nén 3D (gate ≤ 8 MB) và thời gian (gate ≤ 10 s). Chạy **3 lần cold load**, gate theo **kết quả xấu nhất** (§8).
  - Ghi kết quả kèm cấu hình máy theo ADR 0007 (nhãn "desktop dGPU RTX 3060"; OS, phiên bản Edge, viewport, DPR) vào `docs/evidence/A1/load-budget-<ngày>.md`. Không đổi ngưỡng; FAIL thì ghi FAIL.
  - `tools/load-budget/`: hàm thuần tính tổng/đánh giá gate từ danh sách request (unit test trong `tests/unit/tools/`).
  - **Lighthouse CI**: cấu hình cho `/en/`, `/en/quick/`, một trang case study; assert performance metrics LCP ≤ 2,5 s, CLS ≤ 0,1, TBT làm proxy cho INP (ghi rõ là proxy lab, §8 "Lab trước launch"), accessibility score ghi lại (không gate thay axe). Local chạy với `CHROME_PATH` trỏ Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) — **không tải Chrome**. Nếu lhci không chạy được với Edge, ghi NOT RUN + lý do.
  - Workflow: thêm job/step perf chạy sau e2e; lhci dùng `temporary-public-storage`? **Không** — chỉ lưu báo cáo làm artifact của workflow (không upload ra dịch vụ ngoài).
- Điều kiện xong:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` exit 0
  - Chạy perf trace local 3 lần, có file kết quả trong `docs/evidence/A1/`
  - lhci local: chạy được hoặc NOT RUN có lý do
  - Một commit trên nhánh
- Bàn giao: bảng kết quả (từng lần + xấu nhất) với PASS/FAIL theo §8, output lhci, script đề xuất, việc chưa làm.
