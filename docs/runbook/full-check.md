# Runbook — Danh sách "kiểm full" sau mỗi đợt merge

Mục đích: một danh sách duy nhất, đúng thứ tự, để không bỏ sót cổng nào (đợt 5–10 từng bỏ sót hồi quy Lighthouse vì thiếu `perf:lhci`; CI #2–#3 đỏ ở gitleaks vì local không chạy được). Mỗi bước ghi PASS / FAIL / NOT RUN / BLOCKED / DEFERRED kèm output thật; không ghi PASS nếu chưa chạy.

Chạy trên `main` sau khi merge (hoặc trong worktree tích hợp), tại thư mục gốc repo. Windows PowerShell: nạp PATH trước nếu terminal mở trước khi cài công cụ:
`$env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')`

## Thứ tự

| # | Bước | Lệnh | Cần `out/`? | Ai chạy |
|---|---|---|---|---|
| 1 | Lint | `pnpm lint` | không | Lead (lane chạy phần mình sửa) |
| 2 | Typecheck | `pnpm typecheck` | không | Lead |
| 3 | Unit test | `pnpm test` | không | Lead |
| 4 | Build + artifact | `pnpm build:artifacts` (build, CV, OG) | tạo `out/` | Lead |
| 5 | CV | `pnpm check:cv` | có | Lead |
| 6 | Bundle (0 chunk 3D trước Enter World) | `pnpm check:bundle` | có | Lead |
| 7 | Leaks tùy biến (§4.6) | `pnpm check:leaks` | có | Lead |
| 8 | Giấy phép asset (§7.3) | `pnpm check:licenses` | không | Lead |
| 8a | Báo cáo asset World + kiểm file hợp lệ (ADR 0019) | `pnpm check:assets` | không | Lead |
| 9 | gitleaks (giống CI) | `node tools/checks/gitleaks.mjs` (cần `GITLEAKS_BIN`) | có | Lead |
| 10 | E2E + axe | `pnpm test:e2e` | có | **L4** (một lần mỗi đợt merge) |
| 11 | Báo cáo tải + bất biến chức năng (ADR 0019) | `pnpm test:perf` | có | **L4** |
| 12 | **Lighthouse CI** | `pnpm exec lhci autorun --config=tools/checks/lighthouserc.cjs` rồi `node tools/checks/lighthouse-report.mjs` (cần `CHROME_PATH`) | có | **L4** chạy; Lead chạy lại nếu L4 báo FAIL/BLOCKED hoặc đợt có đổi UI/bundle |

Bước 4 phải xong trước các bước 5–12 (cùng một `out/`; đừng build lại giữa chừng).

Windows từ 2026-11-12: Application Control chặn SWC native; trước **một lần build duy nhất** ở bước 4,
đặt `$env:NEXT_TEST_WASM_DIR = 'C:\Users\PC-LP\AppData\Local\next-swc\wasm\package'` và
`$env:NEXT_BUILD_WEBPACK = '1'`, rồi chạy `pnpm.cmd build:artifacts`. Trên GitHub Ubuntu dùng lệnh mặc định.
REL-03 chỉ kiểm release kit, không thực hiện bước build/e2e/perf này.

## Phân công

- **L4 (QA)** là lane duy nhất chạy full e2e/perf: bước 10, 11, 12, một lần cho mỗi đợt merge (CLAUDE.md §3.1).
- **Lead** chạy bước 1–9 trên `main` sau merge, và chạy lại bất kỳ bước nào của L4 mà báo cáo thiếu output thật, FAIL hoặc BLOCKED. Lead không dựa vào lời "đã pass" của lane.
- Các lane khác chỉ chạy phần liên quan đến vùng mình sửa trước khi bàn giao.

## gitleaks (bước 9)

CI chạy gitleaks v8.28.0 trong container (ghim digest). Máy local không dùng Docker; dùng binary chính thức cùng phiên bản đã kiểm checksum (Lead giữ). Script không tải gì từ mạng.

```powershell
$env:GITLEAKS_BIN = "<đường dẫn tới gitleaks.exe v8.28.0>"
node tools/checks/gitleaks.mjs
```

Script chạy đúng 3 lệnh như CI, với `--config .gitleaks.toml --redact --no-banner --exit-code 1`: `dir out`, `dir src/content`, `git .`.

| Exit | Nghĩa | Ghi trạng thái |
|---|---|---|
| 0 | cả 3 lệnh sạch | PASS |
| 1 | có phát hiện hoặc lỗi chạy | FAIL |
| 2 | thiếu/sai `GITLEAKS_BIN`, thiếu `out/` hoặc `.gitleaks.toml` | **BLOCKED** (không phải PASS) |

Lưu ý: `git .` quét toàn bộ lịch sử của clone/worktree hiện tại (CI dùng `fetch-depth: 0`); chạy ở worktree có đủ lịch sử.

## Lighthouse (bước 12)

`lighthouserc.cjs` cần Chrome/Edge cài sẵn, không tải trình duyệt. Local dùng Edge:

```powershell
$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
pnpm exec lhci autorun --config=tools/checks/lighthouserc.cjs
node tools/checks/lighthouse-report.mjs
```

Thiếu `CHROME_PATH` thì ghi BLOCKED, không bỏ qua. Theo ADR 0019, LCP/TBT chỉ báo cáo; CLS và lỗi thu thập vẫn chặn. Dùng config ở `tools/checks/` ở trên trong khi chờ Lead cập nhật script `perf:lhci` trong `package.json`. Báo cáo nằm ở `test-results/lhci` và `.lighthouseci/` (không đẩy lên lưu trữ công khai).

## Đọc báo cáo ngân sách — ADR 0019 (14/11/2026)

Không còn gate cho tổng MB world, byte asset/bundle/Enter World → playable, tam giác, draw call, thời gian dựng/tải, FPS hay CPU. Không tăng các hằng ngưỡng cũ: chúng chỉ còn là `legacyReference`, giúp đọc lại báo cáo lịch sử. `REPORT` là số đo, không phải lỗi; `PASS` của checker nghĩa là các bất biến còn chặn đã đạt, không có nghĩa là đạt ngưỡng hiệu năng cũ.

- `pnpm check:assets`: JSON có `worldBytes`, `startBytes`, từng asset `bytes`/`triangles`, `comparisons` và `measurement`. GLB đọc qua NodeIO/meshopt; KTX2 độc lập và nhúng trong GLB được kiểm container/header/index/range. Lỗi đọc, tên sai, symlink và lỗi filesystem vẫn exit khác 0. Kiểm transcoding/GPU thực tế thuộc e2e và kiểm hình của Lead.
- `pnpm check:bundle`: bảng từng trang, JS gzip và tổng transfer. Vượt mốc cũ chỉ thêm dòng `REPORT`; thiếu trang/tài nguyên, marker world hoặc tham chiếu 3D trước Enter World vẫn FAIL.
- `pnpm test:perf`: giữ phương pháp cold load và báo cáo từng lượt/xấu nhất. Byte và thời gian hiện `REPORT`; world không trở nên chơi được vẫn FAIL. Timeout thu thập hữu hạn để phát hiện treo không phải cam kết ≤10 s. Throttle CPU không được bỏ qua lỗi chức năng.
- T08: FPS/p95/frame chậm là báo cáo; không đo được frame, focus/pause/quality sai và console/page error vẫn FAIL. T09 giữ gate xu hướng rò rỉ tài nguyên. Journey giữ kiểm chức năng, tuyến và nhịp đi bộ; các mốc hành trình là thiết kế gameplay, không phải trần thời gian tải/CPU.
- Unit world: `BUDGET REPORT` in số đo, mốc cũ và `deltaFromReference`; các kiểm LOD, instancing, tính hữu hạn, hình học, dispose và giới hạn phần cứng WebGL vẫn chặn.

`tools/checks/budget-report.mjs` lưu artifact JSON trong `test-results/budget-reports/` (có thể đổi bằng `BUDGET_REPORT_DIR`). Mỗi JSON có `measuredAt`, `previousAt`, `metrics`, `delta`: delta = lần này − lần trước của cùng khóa. Số dương nghĩa tăng, không làm FAIL. Khóa mới/lần đầu có delta `null`, `previousAt: null` nghĩa **chưa có baseline**, không phải delta 0. Local giữ thư mục này giữa các lần đo; muốn so với commit khác, chép bộ JSON của commit đó vào đây trước khi chạy. Không đưa artifact vào git, browser storage hay URL.

CI khôi phục cache lần thành công gần nhất của cùng ref, fallback main, rồi lưu cache mới với run ID/attempt riêng. Artifact `perf-reports` chứa cả bộ JSON; cache miss vẫn ghi rõ chưa có baseline. So sánh thời gian/FPS/CPU chỉ có ý nghĩa khi cùng máy, profile, throttle, quality và phương pháp; load report tách locale/throttle, frame report tách scenario/run. Unit lưu số cuối mỗi biểu thức trong JSON, đồng thời log mọi lần đo trong vòng lặp/seed. Lưu commit, máy và log cùng báo cáo khi bàn giao.

REL-03 (`.github/workflows/deploy.yml`) vẫn chạy checker asset trước bước OIDC; vượt trần không chặn, file hỏng/license lỗi vẫn chặn. Không dùng `continue-on-error`, `|| true` hoặc ép exit 0 cho cả checker vì sẽ che lỗi thật. `tools/lead/gate.sh` không có trần ngân sách riêng, tiếp tục chặn lint/typecheck/unit.

Danh mục chi tiết file:dòng và trước/sau: [BUDGET-OFF handoff](budget-off-handoff.md).

## Mẫu ghi kết quả

```
<bước> — <PASS/FAIL/NOT RUN/BLOCKED/DEFERRED> — <commit> — <môi trường> — <output hoặc đường dẫn bằng chứng>
```
