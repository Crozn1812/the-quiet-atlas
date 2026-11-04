## TICKET L4-011 — QA đợt 11: kiểm full (có Lighthouse + gitleaks), rủi ro L1-011, T09 chạy lại

- Trạng thái: **Assigned → subagent L4** (2026-11-04, đợt 11), nhánh `lane/L4-011`, worktree `D:/tqa-worktrees/L4-011`
- Lane / milestone: L4 QA / A1 + B1
- Đã merge (main `c01daf4`): L2-011 (experience/education, CV), L1-011 (bỏ probe WebGL trên thiết bị Editorial, cache kết quả; focus về Enter World chuyển vào effect), L5-011 (`check:gitleaks`, `docs/runbook/full-check.md`).
- Việc:
  1. **Kiểm full theo `docs/runbook/full-check.md`** (đủ 12 bước, gồm `check:gitleaks` với `GITLEAKS_BIN` Lead đưa, và `perf:lhci` với `CHROME_PATH` Edge). Dán dòng tổng kết mỗi bước.
  2. **Rủi ro L1-011 cần e2e** (thêm nếu chưa có): (a) Enter World lỗi → nút Retry → lỗi lần 2 → focus đúng Enter World; (b) đổi ngôn ngữ trong world rồi Thoát → về `/vi/`; (c) viewport < 1024 lúc tải rồi resize ≥ 1024 → nút Enter World bật lại (probe WebGL chạy khi resize); (d) pointer coarse → Editorial, không tạo WebGL context lúc tải (đếm `getContext("webgl2")` bằng init script như các spec trước).
  3. **T09 chạy lại**: lần trước FAIL vì rAF tụt đều ~1 Hz giữa chừng. Thêm vào launch args của `playwright.frame.config.ts` (chỉ môi trường test, không đổi ngưỡng): `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`, `--disable-background-timer-throttling`, `--disable-features=CalculateNativeWinOcclusion`. Ghi lại `document.visibilityState` và `document.hasFocus()` mỗi 10 s trong log. Chạy T09 (`PERF_LONG=1`) **khi không có job nặng khác** (chạy sau bước 1). Nếu vẫn FAIL: ghi FAIL kèm log visibility — không nới ngưỡng. Chạy lại T08 Low 1 lần với cùng flags để xác nhận flags không làm số đẹp giả.
- Được sửa: `tests/`, playwright config
- Không được sửa: `src/`, `tools/`, `package.json`, lockfile, `docs/`, `.github/`. Lỗi sản phẩm → `test.fail()` + báo Lead.
- Điều kiện xong: mọi bước ở mục 1 exit 0 (hoặc báo rõ bước nào FAIL + output); e2e mới PASS; số liệu T09/T08 đầy đủ. Không commit.
