## TICKET L1-011 — Sửa hồi quy Total Blocking Time ở Welcome (do L1-008)

- Trạng thái: **Assigned → Codex gpt-6.1-sol, effort high** (2026-11-04, đợt 11), nhánh `lane/L1-011`, worktree `D:/tqa-worktrees/L1-011`
- Lane / milestone: L1 Portfolio UI / A1 — **chặn CI xanh** (Lighthouse CI fail)
- Spec: §8 "Quick web UX" (LCP ≤ 2,5 s, CLS ≤ 0,1, INP ≤ 200 ms — lab dùng TBT ≤ 200 ms làm proxy); ADR 0009; `lighthouserc.cjs`
- Bằng chứng (Lead bisect, Lighthouse mobile mặc định, CPU 4×, 3 lần, Edge 156, `/en/`):

| Commit | TBT ms (3 lần) | bootup-time ms |
|---|---|---|
| `01a2ee1` (đợt 7) | 34 / 73 / 39 | 175 / 251 / 200 |
| `1780355` (trước L1-008) | 80 / 30 / 37 | 227 / 182 / 178 |
| **`f54407e` (L1-008)** | **482 / 293 / 252** | **684 / 463 / 465** |
| `7fd5d49` (hiện tại) | 277 / 283 / 291 | 436 / 442 / 462 |

  Lighthouse trên main: long task ~460 ms trong chunk framework (`_next/static/chunks/0-*.js`, ~207 KB) khi hydrate `/en/`; `/en/quick/` và case study chỉ ~40 ms TBT.
- Mục tiêu: TBT `/en/` và `/vi/` ≤ 200 ms ở lần **xấu nhất** của 3 lần (mục tiêu thực tế ≤ ~100 ms như trước L1-008), **không** nới ngưỡng, **không** đổi `lighthouserc.cjs`.
- Cách làm:
  1. Chẩn đoán trước, có số: dùng Lighthouse/trace (Edge tại `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, `CHROME_PATH`) so `1780355` và HEAD để chỉ ra công việc nào trên main thread tăng (hydrate cây lớn hơn vì `children`/backdrop nằm trong client component? effect chạy đồng bộ lúc mount — `readCapabilities()` tạo WebGL context, listener resize/matchMedia? style/layout do `position: fixed` toàn màn?). Ghi kết luận vào bàn giao kèm số liệu.
  2. Sửa đúng nguyên nhân, giữ nguyên trải nghiệm ADR 0009 (khung toàn màn hình, thẻ góc dưới trái, HUD, no-JS vẫn đọc được). Hướng có thể: giữ phần tĩnh (thẻ, backdrop) là Server Component và chỉ hydrate đảo nhỏ (nút Enter World/HUD); hoãn kiểm tra WebGL tới lúc rảnh (`requestIdleCallback`/sau tương tác đầu) nhưng nút vẫn đúng trạng thái; tránh layout thrash.
  3. Không đổi hành vi đã có e2e: Enter World, fallback Editorial (<1024 px / không WebGL / pointer coarse), HUD 6 nút, đổi ngôn ngữ, skip link `#content`.
- Được sửa: `src/app/`, `src/components/portfolio/`, `tests/unit/portfolio/`
- Không được sửa: `src/features/`, `src/state/`, `src/content/`, `tools/`, `tests/e2e/`, `tests/perf/`, `lighthouserc.cjs`, `package.json`, lockfile, config, `docs/`. Không cài gói.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` exit 0; **`CHROME_PATH=<Edge> pnpm exec lhci autorun` exit 0** (dán bảng TBT/LCP/CLS từng URL, 3 lần). JS ban đầu `/en/` không tăng. Không chạy full e2e (L4). Không commit.
- Bàn giao: nguyên nhân + số liệu trước/sau, thay đổi, lệnh + exit code, rủi ro cho e2e để L4 kiểm.
