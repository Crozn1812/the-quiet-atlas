# PROJECT_STATUS — The Quiet Atlas

> Cập nhật lần cuối: 2026-11-03 (phiên 1). Spec: `docs/spec/The_Quiet_Atlas_Master_Prompt_V6.md`.

## Milestone hiện tại

| Track | Mốc | Trạng thái |
|---|---|---|
| A — Portfolio | **A0** — Nội dung và hợp đồng | Đang làm |
| B — World | B1 / P01-A | Chưa bắt đầu (chờ công cụ) |

## Đã có

- Khung thư mục theo §15 (thư mục rỗng có `.gitkeep`).
- Spec V6 tại `docs/spec/`.
- ADR 0001 (static export và routes): **Proposed**.
- Ticket nháp đầu tiên cho L1/L2/L3 ở `docs/tickets/` — chưa giao, chưa có repo.

- Git repo trên nhánh `main` (chưa có remote).
- Nền P01-A: Next.js 16.4.4 static export, lockfile pnpm, route `/`, `/en/`, `/vi/`, `404.html` dựng được; luật lint chặn import tĩnh `features/world`. Phiên bản ghim trong ADR 0001.

### Kiểm tra local đã chạy (2026-11-03, máy dev Windows 11, Node 26.13.0)

| Lệnh | Kết quả |
|---|---|
| `pnpm build` | Exit 0 |
| `pnpm typecheck` | Exit 0 |
| `pnpm lint` | Exit 0; probe import `features/world` từ `src/app` → fail đúng |
| `pnpm test` | 2/2 test pass |

Đây là kiểm tra nền, chưa phải gate T/Q nào.

### Ticket

| Ticket | Lane | Trạng thái |
|---|---|---|
| L1-001 schema + Welcome/Quick + `lang` | L1 Codex | **Merged** (2cb4065). Lead chạy lại: lint/typecheck/test/build exit 0; check:bundle PASS 6 trang (≤ 138 KB JS gzip); `/vi/` có `lang="vi"`. Lỗi còn: `404.html` thiếu `lang` |
| L2-001 spike physics + ADR 0002 | L2 Codex | **Merged** (eb6439b). Lead chạy lại: lint/typecheck/test (10) /build exit 0; marker world không có trong `out/`. ADR 0002 **Proposed**: đề xuất Rapier KCC, collision bundle +1,65 MB gzip, đo CPU trên máy dev |

Kiểm tra `main` sau khi gộp cả ba (eb6439b): lint, typecheck, test 43/43, build, check:bundle đều exit 0. Chưa phải gate T/Q.

### Đợt 2 (2026-11-03)

| Ticket | Trạng thái |
|---|---|
| L1-002 Enter World lazy + §3.4 + 404 `lang` + dọn code | **Merged** (63a3dee) |
| L2-002 benchmark → `tools/`, input reducer | **Merged** (19c9216); `vite` khai báo devDependency (e0a53f2) |
| L3-002 scan-leaks §4.6, `.gitleaks.toml`, check-licenses | **Merged**; image `ghcr.io/gitleaks/gitleaks:v8.28.0` tồn tại (Lead kiểm `docker manifest inspect`), nhưng **gitleaks chưa chạy lần nào** → NOT RUN; regex RE2 chưa kiểm bằng gitleaks thật |

Kiểm `main` sau đợt 2: lint, typecheck, test 86/86, build, `check:bundle`, `check:leaks`, `check:licenses` đều exit 0.

**Lead kiểm thủ công trên trình duyệt** (built-in browser của Claude desktop, Chromium, server tĩnh local `127.0.0.1:4173` phục vụ `out/` của L1-002, máy dev): đây là bằng chứng sơ bộ, **chưa phải** gate T01/T02 (cần Playwright tự động):
- `/en/` trước Enter World: 9 request (HTML, 1 CSS, 8 JS shell), 0 request GLB/WASM/chunk world.
- Bấm Enter World ở viewport 1366×800: tải thêm 4 chunk JS, canvas hiện cảnh thử, `data-world-chunk` có marker, focus vào vùng world, URL không đổi. "Back to Welcome" gỡ canvas, focus về nút Enter World.
- Viewport 800 px, `/vi/`: Enter World ẩn, hiện "Xem bản Editorial" → `/vi/quick/` + lý do tiếng Việt; `lang="vi"`.
- URL không tồn tại → trang 404 `lang="en"`.

Lưu ý: kiểm năng lực đọc WebGL2 bằng cách tạo context tạm khi trang load (không tải chunk 3D). Chấp nhận được; xem lại nếu đo thấy tốn trên máy yếu.

### Ticket tiếp theo (nháp, chưa giao)

- L3-003: Playwright T01/T02/T07 (phần HTML), axe-core; chạy gitleaks thật (Docker local hoặc CI) và ghim image theo digest.
- L1-003: trang case study `/{locale}/projects/{slug}/` + privacy + sitemap/robots (§4.5, §4.7, §5) — dữ liệu vẫn TBD.
- L2-003: P01-C character controller (slope, recovery point) trên Rapier — chỉ bắt đầu sau khi chốt máy tham chiếu hoặc ghi ADR nhãn máy dev.
| L3-001 CI PR + check-bundle | L3 subagent | **Merged** (341c93f). Lead chạy lại: lint/typecheck/test/build exit 0; `pnpm check:bundle` PASS trên scaffold; fixture rò marker → exit 1. Workflow GitHub: NOT RUN (chưa có remote) |

Lưu ý ngân sách: scaffold rỗng đã dùng **135,3 / 150 KB** JS gzip (không tính script `noModule` 38,6 KB chỉ trình duyệt cũ tải). L1 còn ~15 KB cho client component — ưu tiên Server Component, không thêm thư viện client.

## Chưa có

- Remote GitHub (repo public — Duy tạo hoặc giao Lead).
- Worktree cho các lane; chưa giao ticket nào cho Codex.
- `lang` theo locale cho `/vi/` (ADR 0001, việc còn mở).

## Blocker thật

| # | Blocker | Ảnh hưởng | Cần ai |
|---|---|---|---|
| ~~B1–B3~~ | ~~Thiếu git/node/pnpm/codex~~ | Đã cài 2026-11-03, xem `docs/runbook/setup.md` | — |
| ~~B4~~ | ~~Chưa có git identity~~ | Đã đặt global theo lựa chọn của Duy (Gmail) | — |

## Gate

Chưa có gate nào chạy. Mọi test T01–T11, Q12–Q26: **NOT RUN**.

| Gate | Trạng thái |
|---|---|
| T01–T11 | NOT RUN |
| Q12–Q26 | NOT RUN |
| T08 (performance) | BLOCKED — chưa có máy tham chiếu |

## Quyết định của Duy (nhóm "Trước A1", §17) — trả lời 2026-11-03

| # | Câu hỏi | Trả lời | Ghi chú Lead |
|---|---|---|---|
| 1 | Cấp độ vai trò | Intern, có 6 tháng kinh nghiệm | Hiển thị "Cloud & DevOps Engineer — Intern"; "6 tháng" cần mục evidence (nơi, thời gian) trước khi lên public |
| 2 | Hai track + timebox | 15 giờ/tuần | Thấp hơn giả định 15–20 h; timebox §12 giữ nguyên số tuần làm mốc, Lead theo dõi trễ |
| 3 | Email portfolio | Gmail cá nhân (đã nhận trong chat phiên 1) | Tạm thời đến khi có tên miền; sau đó đổi sang `hello@<domain>` |
| 4 | Điện thoại | Hiện cả trên web | Chủ dự án chọn khác mặc định §4.4; số điện thoại: TBD (chưa cung cấp) |
| 5 | Dự án | 2 dự án có repo GitHub | Chưa biết là 2 dự án nào và URL repo → TBD |
| 6 | Máy benchmark | Desktop i5-14400F, RTX 3060 12 GB, RAM 36 GB, SSD 512 GB | Là GPU rời, **không phải máy iGPU tham chiếu** của §8/T08 → dùng làm máy dev, nhãn riêng; T08 vẫn BLOCKED |
| 7 | Repo | Public | Không lưu nháp/mật trong repo (§4.1); nháp để ngoài repo hoặc `content-private/` (đã gitignore) |

Còn thiếu: tên + URL 2 repo dự án, trạng thái 2 dự án còn lại, số điện thoại, OS/trình duyệt/màn hình máy dev, có laptop iGPU để làm máy tham chiếu không.

## Cloud, tên miền

| Mục | Giá trị |
|---|---|
| Ngày đăng ký AWS | TBD |
| Ngày hết hạn credits | TBD |
| Paid plan | Chưa (chưa cần trước A2) |
| Tên miền / registrar | TBD |
| Resource cloud đã tạo | Không có |
