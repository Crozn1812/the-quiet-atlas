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
| 9 | gitleaks (giống CI) | `node tools/checks/gitleaks.mjs` (cần `GITLEAKS_BIN`) | có | Lead |
| 10 | E2E + axe | `pnpm test:e2e` | có | **L4** (một lần mỗi đợt merge) |
| 11 | Load budget | `pnpm test:perf` | có | **L4** |
| 12 | **Lighthouse CI** | `pnpm perf:lhci` (cần `CHROME_PATH`) | có | **L4** chạy; Lead chạy lại nếu L4 báo FAIL/BLOCKED hoặc đợt có đổi UI/bundle |

Bước 4 phải xong trước các bước 5–12 (cùng một `out/`; đừng build lại giữa chừng).

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
pnpm perf:lhci
```

Thiếu `CHROME_PATH` thì ghi BLOCKED, không bỏ qua. Ngưỡng (LCP, CLS, TBT) không được nâng sau khi đo thất bại (CLAUDE.md §6). Báo cáo nằm ở `test-results/lhci` và `.lighthouseci/` (không đẩy lên lưu trữ công khai).

## Mẫu ghi kết quả

```
<bước> — <PASS/FAIL/NOT RUN/BLOCKED/DEFERRED> — <commit> — <môi trường> — <output hoặc đường dẫn bằng chứng>
```
