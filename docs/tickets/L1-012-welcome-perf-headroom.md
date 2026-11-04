## TICKET L1-012 — Tạo dư địa hiệu năng cho Welcome (Lighthouse CI fail trên runner GitHub)

- Trạng thái: **Assigned → Codex gpt-6.1-sol, effort high** (2026-11-04, đợt 11), nhánh `lane/L1-012`, worktree `D:/tqa-worktrees/L1-012`
- Lane / milestone: L1 Portfolio UI / A1 — **chặn CI xanh**
- Spec: §8 "Quick web UX" (LCP ≤ 2,5 s, CLS ≤ 0,1, TBT ≤ 200 ms proxy INP); ADR 0009; `lighthouserc.cjs` (**không sửa**, không nới ngưỡng, không đổi số lần chạy/aggregation)
- Bằng chứng CI (run cho `b38289c`, ubuntu runner, Chrome, mobile mặc định, 3 lần, `pessimistic`):

| URL | TBT ms (3 lần) | LCP ms (3 lần) | bootup ms | benchmarkIndex |
|---|---|---|---|---|
| `/en/` | **232** / 105 / 121 | **2565** / 2415 / 2429 | 481 / 271 / 292 | 2011 / 2453 / 2416 |
| `/en/quick/` | 93 / 103 / 96 | 2403 / 2410 / 2404 | 234–243 | ~2450 |
| case study | 102 / 93 / 94 | 1808 / 1848 / 1808 | 238–246 | ~2440 |

  Máy dev: benchmarkIndex ~3500, `/en/` TBT 38–73 ms, LCP 2209–2342 ms (PASS). Lịch sử: trước font tự host (đợt 9) LCP local ≤ 2,05 s.
- Mục tiêu (đo local, mô phỏng runner chậm): chạy lhci với **`--collect.settings.throttling.cpuSlowdownMultiplier=8`** (≈ runner benchmarkIndex ~2000) cho `/en/`, `/vi/`, `/en/quick/`, 3 lần: **TBT xấu nhất ≤ 150 ms và LCP xấu nhất ≤ 2,3 s**; đồng thời `lhci autorun` mặc định exit 0.
- Hướng điều tra (chẩn đoán bằng trace trước, ghi số):
  1. **LCP**: phần tử LCP của `/en/` là gì; ảnh hưởng của preload font + `font-display: swap` (Quick cũng ~2,4 s → có thể chung nguyên nhân CSS/font). Cân nhắc: bỏ preload, `font-display: optional` cho subset không cần ngay, inline CSS tới hạn nhỏ, giảm request chặn render. Giữ đúng §7.3: chữ Việt vẫn hiển thị đúng (fallback stack có dấu).
  2. **TBT/bootup Welcome cao hơn Quick ~40–50 ms**: phần client của `WorldEntry` hydrate cả thẻ; tách phần tĩnh thành Server Component, chỉ hydrate đảo tương tác nhỏ; tránh setState đồng bộ lúc mount gây render 2 lần.
  3. Không đổi hành vi có e2e (Enter World, fallback Editorial, HUD 6 nút, đổi ngôn ngữ, skip link `#content`, focus Retry — `tests/e2e/world-entry-risk.spec.ts`).
- Được sửa: `src/app/`, `src/components/portfolio/`, `public/fonts/` (chỉ bớt, không thêm font mới), `tests/unit/portfolio/`
- Không được sửa: `lighthouserc.cjs`, `src/features/`, `src/state/`, `src/content/`, `tools/`, `tests/e2e/`, `tests/perf/`, `package.json`, lockfile, config, `docs/`. Không cài gói.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle`, `pnpm check:licenses` exit 0; bảng lhci trước/sau (mặc định và cpuSlowdown 8) cho 3 URL × 3 lần; Edge tại `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` (`CHROME_PATH`), dùng `LHCI_PORT` khác 4175 nếu cổng bận. Không chạy full e2e (L4). Không commit.
