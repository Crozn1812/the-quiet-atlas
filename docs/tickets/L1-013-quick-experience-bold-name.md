## TICKET L1-013 — Quick hiện Kinh nghiệm/Học vấn, evidence theo ngôn ngữ, tên Welcome đậm lại

- Trạng thái: **Assigned → Codex gpt-6.1-sol, effort medium** (2026-11-04, đợt 12), nhánh `lane/L1-013`, worktree `D:/tqa-worktrees/L1-013`
- Lane / milestone: L1 Portfolio UI / A1
- Spec: §2 (Quick), §7.3 (font tiếng Việt), §8 (LCP ≤ 2,5 s, TBT ≤ 200 ms); ADR 0009, ADR 0010 (cả "Mở rộng đợt 12")
- Việc:
  1. **Quick** (`QuickPortfolio.tsx` và component con): thêm mục "Experience"/"Kinh nghiệm" và "Education"/"Học vấn" từ `profile.experience` / `profile.education`. Khoảng thời gian `07/2026 – present` / `07/2026 – nay`; `summary` là "TBD" thì không in câu. Semantic HTML (`section` + `h2`, `dl` hoặc danh sách), không thêm JS client (Server Component).
  2. **Evidence theo ngôn ngữ**: `EvidenceView` dùng `claimEn ?? claim`, `scopeEn ?? scope` khi locale `en` (trường mới là optional — code phải chạy được khi chưa có dữ liệu; khai báo kiểu cục bộ, không sửa `src/content/`).
  3. **Q-22 — tên Welcome đậm lại**: `.welcome-card h1` weight 700 dùng Noto Serif 700 đã có trong `public/fonts/`. Không preload font 700; giữ `font-display: swap`; không thêm file font.
- Được sửa: `src/app/`, `src/components/portfolio/`, `tests/unit/portfolio/`
- Không được sửa: `src/content/`, `src/features/`, `src/state/`, `tools/`, `tests/e2e/`, `tests/perf/`, `lighthouserc.cjs`, `package.json`, lockfile, config, `docs/`, `public/fonts/`
- Ràng buộc: không import `features/world` vào Quick; JS ban đầu của Welcome không tăng (≤ 134,6 KB gzip theo `pnpm check:bundle`); không đổi hành vi có e2e.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle`, `pnpm check:licenses` exit 0 — dán dòng tổng kết. **Không chạy Lighthouse/e2e** (sandbox không mở được trình duyệt; Lead đo sau). Không commit.
- Bàn giao: danh sách file sửa, output lệnh, ảnh hưởng dự kiến lên LCP.
