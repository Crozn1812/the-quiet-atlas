## TICKET L1-014 — Giảm việc main-thread lúc tải Welcome để Lighthouse CI ổn định trên runner chậm

- Trạng thái: **Assigned → subagent L1 (opus)** (2026-11-04, đợt 12b), nhánh `lane/L1-014`, worktree `D:/tqa-worktrees/L1-014`. Không giao Codex: cần đo bằng trình duyệt (sandbox Codex chặn Edge).
- Lane / milestone: L1 Portfolio UI / A1 — **chặn CI xanh**
- Spec: §8 (LCP ≤ 2,5 s, CLS ≤ 0,1, TBT ≤ 200 ms proxy INP); ADR 0009; `lighthouserc.cjs` (**không sửa**, không nới ngưỡng, không đổi số lần chạy/aggregation)
- Bằng chứng CI (run 41828064480, `dc8fc19`, ubuntu, mobile mặc định, 3 lần, `pessimistic`):

| URL | TBT ms | LCP ms | bootup ms | benchmarkIndex |
|---|---|---|---|---|
| `/en/` | **246** / 96 / 104 | 2419 / 2253 / 2263 | **479** / 248 / 254 | **1893** / 2467 / 2405 |
| `/en/quick/` | 85 / 86 / 91 | ~1810 | 220–234 | ~2480 |
| case study | 89 / 90 / 97 | 1809–2253 | ~232 | ~2440 |

  Máy dev (L4-012): `/en/` TBT ≤ 42 ms mặc định; CPU×8 TBT 131–156 ms, LCP 2285–2311 ms. Welcome luôn nặng hơn Quick (~10–15 ms TBT trên CI, ~20 ms bootup) do client island `WorldEntry` (`"use client"`, bọc cả thẻ Welcome + HUD).
- Mục tiêu: chạy lhci local với `--collect.settings.throttling.cpuSlowdownMultiplier=10` (mô phỏng runner benchmarkIndex ~1900) cho `/en/`, `/vi/`, `/en/quick/`, 3 lần: **TBT xấu nhất `/en/` ≤ 170 ms**, LCP ≤ 2,5 s; đồng thời `pnpm perf:lhci` mặc định exit 0. Đo trước và sau với cùng cấu hình.
- Hướng điều tra (trace trước, ghi số):
  1. Long task lúc tải `/en/` gồm gì: hydrate framework, hydrate `WorldEntry`, effect lúc mount (capability reader, listener, `matchMedia`, focus), CSS/font 700 mới (Q-22)? So với `/en/quick/`.
  2. Thu nhỏ đảo client: để phần tĩnh (thẻ Welcome, text, liên kết CV/Quick/Email) là Server Component; chỉ hydrate nút Enter World + HUD; chuyển việc không cần ngay (đọc capability, đăng ký listener) sang `requestIdleCallback`/sau tương tác đầu, **miễn không đổi hành vi có e2e**.
  3. Nếu sàn là runtime Next/React (như đợt 11 kết luận với trang privacy), ghi số chứng minh và đề xuất (không tự làm) thay đổi config Next cho Lead (`next.config`, ADR).
- Không đổi hành vi có e2e: Enter World, fallback Editorial, HUD 6 nút, đổi ngôn ngữ trong world, skip link `#content`, focus Retry (`tests/e2e/world-entry-risk.spec.ts`), tên Welcome đậm (Q-22).
- Được sửa: `src/app/`, `src/components/portfolio/`, `tests/unit/portfolio/`
- Không được sửa: `lighthouserc.cjs`, `src/features/`, `src/state/`, `src/content/`, `tools/`, `tests/e2e/`, `tests/perf/`, `package.json`, lockfile, `next.config.*`, `tsconfig`, `docs/`. Không cài gói.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle`, `pnpm check:licenses` exit 0; e2e liên quan Welcome/Enter World (`world-entry-risk`, `full-viewport`, `fonts`, a11y Welcome) PASS; bảng lhci trước/sau (mặc định và CPU×10) cho 3 URL × 3 lần. Edge `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` (`CHROME_PATH`), `LHCI_PORT` cổng trống; kill `serve-gzip` sót trước khi đo. Không commit.
