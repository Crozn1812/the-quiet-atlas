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
