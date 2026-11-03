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

### Đợt 3 (2026-11-04)

| Ticket | Trạng thái |
|---|---|
| L1-003 case study ×8, privacy, SEO, sitemap/robots, link repo + evidence | **Merged** (9661db1) sau 1 vòng sửa (title privacy hỏng ký tự, JSON-LD không escape, 404 thiếu title, định dạng) |
| L2-003 P01-B terrain + heightfield, cây instancing, ánh sáng, fog | **Merged** (5658741). Lead xem trên trình duyệt: rừng render, nhân vật đi bằng W, 0 lỗi console. Draw call thực: NOT RUN |
| L3-003 Playwright + axe + serve-out + gitleaks digest | **Merged** (78de9c1) + Lead bỏ known-issue `document-title` đã hết |

Kiểm `main`: lint, typecheck, unit test, build, check:bundle/leaks/licenses exit 0; `pnpm test:e2e` 22/22.

### Gate (chi tiết: `docs/evidence/A1/e2e-2026-11-04.md`)

| Gate | Trạng thái |
|---|---|
| T01 | FAIL nhỏ — thiếu favicon gây lỗi console |
| T02 | PASS (local, Edge, serve-out) |
| T07 | PASS một phần (HTML Enter/Back); overlay NOT RUN |
| T11 | FAIL — 2 vi phạm axe serious; kiểm bàn phím/screen reader NOT RUN |
| Q12 | PASS local; CloudFront/tên miền NOT RUN |
| gitleaks | BLOCKED — Docker Desktop không khởi động (WSL chưa cài). Image ghim digest `sha256:cdbb7c95…a854` (đọc từ registry, chưa pull) |

### Đợt 4 (2026-11-04)

| Ticket | Trạng thái |
|---|---|
| L1-004 nút CV, target 24 px, favicon tự vẽ, tắt RSC prefetch | **Merged** (da1582b); Lead xóa hết `KNOWN_ISSUES` trong e2e |
| L2-004 P01-C: WASD theo yaw camera, chạy, dốc 45°, autostep, recovery | **Merged** (315c9cb) |
| L3-004 đo ngân sách tải cold-cache + Lighthouse CI | **Merged**; Lead chạy lại trên `main` |

Kiểm `main` sau đợt 4: lint, typecheck, unit (109), build, check:bundle/leaks/licenses, e2e 21/21, test:perf, perf:lhci đều exit 0.

### Gate cập nhật (môi trường: máy dev ADR 0007, Edge 156, server local — **không phải CDN**)

| Gate | Trạng thái | Bằng chứng |
|---|---|---|
| T01 | PASS (local) — 0 lỗi console, không còn ngoại lệ | `docs/evidence/A1/e2e-2026-11-04.md` + e2e 21/21 sau L1-004 |
| T02 | PASS (local) | như trên |
| T11 (axe) | PASS phần axe (0 critical/serious, 16 trang); bàn phím/screen reader/zoom 200%: NOT RUN → T11 tổng thể chưa PASS | e2e a11y |
| Q18 | PASS (local): Welcome 146,6 KB/JS 141,8 KB, Quick 146,9 KB, 0 request 3D trước Enter, 3D 1,70 MB, time-to-playable xấu nhất 2,03 s (3 lần, 10 Mbps/RTT 100 ms) | `docs/evidence/A1/load-budget-2026-11-04.md` |
| Web vitals lab (§8) | PASS (local, Lighthouse mobile): LCP ≤ 2,05 s, CLS ≤ 0,015, TBT ≤ 79 ms (proxy INP), a11y 1,00 | `test-results/lhci` (không commit) |
| T03/T04 | Logic có unit test; video/checklist: NOT RUN | — |
| T08 | NOT RUN (FPS/frame time chưa đo) | — |

Lưu ý ngân sách: JS ban đầu 141,8/150 KB (94,5 %) — L1 gần như hết chỗ.

### Đợt 5 (2026-11-04)

| Ticket | Trạng thái |
|---|---|
| ADR 0008 hợp đồng sự kiện UI ↔ world | Accepted |
| L2-005 P01-D camera orbit 360°, zoom 4–16 m, spring arm, mờ tán lá; ADR 0008 phía world | **Merged** (5db7b27) |
| L1-005 menu world (Esc), focus trap, quality, Return to path, bảng phím; nạp lazy | **Merged** (ad858ae); JS ban đầu không đổi (139,3 KB) |
| L3-005 e2e bàn phím/focus/heading/reflow/reduced motion + Q18 bản VI | **Merged** (438473d) |

Kiểm `main`: lint 0 warning, unit 130, build, check:bundle/leaks/licenses, e2e 106 (3 `test.fail()` skip link), test:perf EN+VI đều exit 0.

**Lead kiểm tích hợp trên trình duyệt** (built-in browser, Chromium, máy dev, `tools/serve-out`): Enter World → Esc mở menu, `data-world-paused=true`, focus vào tiêu đề; đổi quality Low → `data-world-quality=low`, canvas giữ nguyên phần tử (không remount), cây thưa hơn; Tab ở phần tử cuối quay về đầu; Esc đóng → `paused=false`, focus về vùng world. Xoay camera bằng ← quan sát được nhưng nhỏ (công cụ gửi phím rời) — T05 trên trình duyệt chưa đo đủ.

### Gate cập nhật

| Gate | Trạng thái |
|---|---|
| T11 | Tự động: axe 0 serious; bàn phím, focus nhìn thấy, heading, reflow 320/640, reduced motion PASS trên các trang đã thử. **FAIL**: chưa có skip link. Screen reader, zoom trình duyệt thật, tương phản focus ring: NOT RUN. Chi tiết `docs/evidence/A1/a11y-keyboard-2026-11-04.md` |
| Q18 | PASS (local) cả EN và VI; time-to-playable xấu nhất 2,00 s |
| T05/T06 | Logic có unit test (yaw, zoom kẹp, spring arm, tán lá); log trên trình duyệt NOT RUN |
| T07 | Menu (overlay) mở/đóng, pause, focus trả lại: Lead kiểm tay PASS; e2e tự động NOT RUN |

### Đợt 6 + 7 (2026-11-04, chạy liền theo yêu cầu của Duy)

| Ticket | Trạng thái |
|---|---|
| L2-006 P01-E bảng chỉ đường + bàn Workshop, E/click ≤ 2,5 m, gợi ý | **Merged** (065ff13) |
| L3-006 e2e menu/pause/quality, Q13, Q21 | **Merged** (576dbab) |
| L1-006 skip link mọi trang; overlay nội dung lazy từ `world-content.json` | **Merged** (f5d09ef) sau 1 vòng sửa (Zod lọt vào chunk client 36,9 KB → 4,7 KB) |
| L2-007 P01-F adaptive quality (chỉ giảm, hysteresis), `tqa:world-error`, perf hook debug | **Merged** (736411c) |
| L1-007 CV PDF EN/VI + 16 ảnh OG lúc build, link `/cv/` tĩnh, xử lý Q15 ở UI | **Merged** (43c0fa6) sau 1 vòng sửa (client island +3,5 KB JS → link tĩnh +0,1 KB; tool phụ thuộc cwd) |
| L3-007 harness T08/T09, e2e overlay, Q15 | **Merged** (dc58c7c); Lead sửa 2 spec L3-006 giả định quality ban đầu, bỏ `test.fail()` Q15, đổi `outputDir` e2e, sửa locator CV trong T01 |

Kiểm `main`: lint 0 warning, typecheck, unit 166, `build:artifacts` (Next + CV + OG), `check:cv`, check:bundle/leaks/licenses, e2e 120 passed / 1 skipped (chạy 2 lần liên tiếp), test:perf EN+VI — đều exit 0.

**Lead kiểm trên trình duyệt** (máy dev, Chromium built-in): Tab đầu tiên = "Skip to content"; Enter World → gần bảng chỉ đường `data-world-hint=first-light`, gợi ý "E — First Light signpost (placeholder)"; E mở overlay "The First Light", world pause, focus tiêu đề; Esc đóng, world chạy tiếp, focus về world. CV PDF tiếng Việt: dấu hiển thị đúng (ảnh render trang 1).

### Gate cập nhật (máy dev ADR 0007, Edge 156, server local — không phải CDN)

| Gate | Trạng thái | Bằng chứng |
|---|---|---|
| T08 (Low) | **PASS** 3/3 lần: FPS TB 100 (giới hạn bởi màn 100 Hz), p95 10,2 ms, 0 % > 100 ms, 0 frame > 250 ms. Desktop dGPU — **không** phải nghiệm thu iGPU | `docs/evidence/B1/t08-2026-11-04.md` (CSV gốc bị xóa do outputDir cũ; số liệu chép trước khi mất + log gốc đã commit) |
| T09 | **PASS**: 10 phút + 20 vòng mở/đóng menu & overlay; heap giảm 12,9 → 9,2 MB, 70 đối tượng WebGL không đổi, 1 canvas | `docs/evidence/B1/t09-2026-11-04.md` |
| T07 | Overlay mở bằng E, pause, focus, Esc trả focus: PASS (e2e). Độ trễ ≤ 300 ms trên máy tham chiếu: NOT RUN | `docs/evidence/B1/e2e-overlay-q15-2026-11-04.md` |
| Q15 | PASS (local): mất context → về HTML ≤ 2 s; không WebGL → Editorial | e2e `q15-context-loss.spec.ts` |
| T11 | Tự động: PASS (axe, bàn phím, focus, heading, reflow, reduced motion, **skip link**). Screen reader / zoom thật: NOT RUN → chưa PASS toàn phần | e2e a11y |
| T01, T02, Q12, Q18 | PASS (local) | như các đợt trước |
| T03, T04, T05, T06, T10 | Logic có unit test; video/checklist/log trình duyệt/chấm ảnh: NOT RUN | — |

### Việc nhỏ tồn đọng

- CV ghi link repo Partner Data Gateway nhưng thiếu chữ "demo" (web có).
- `tools/cv/preview.ps1` còn phụ thuộc thư mục hiện hành.
- Welcome đôi khi không hydrate trong lúc tải nặng (L3 thấy 2 lần) — theo dõi.
- Renderer info (`__tqaPerf`) chưa đo được vì UI không bật `debug`.

### Ticket tiếp theo (nháp, chưa giao)

- L1-008: nhãn "demo" trong CV; `preview.ps1` theo vị trí file; đổi ngôn ngữ trong world (Q21, §6.3 `history.replaceState`, không remount).
- L2-008: Atlas Journal (J) §7.2 — chỉ cần sau khi có thêm khu; hoặc bắt đầu B2 khi A2 live (§12: B2 chỉ sau A2).
- A2 (cloud): **chưa bắt đầu** — cần Duy: repo GitHub, ngày đăng ký AWS, Paid plan, tên miền.
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
| T08 (performance) | NOT RUN — máy tham chiếu chốt ở ADR 0007 (desktop RTX 3060, có nhãn) |

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

### Bổ sung 2026-11-04

| Mục | Trả lời của Duy | Ghi chú Lead |
|---|---|---|
| Repo AWS Sales Data Pipeline | `github.com/Crozn1812/AWS-Sales-Data-Pipeline` | Public, đã kiểm (ls-remote). Evidence `ev-repo-aws-sales-data-pipeline` (Verified — chỉ chứng minh repo tồn tại) |
| Repo InsightHub RAG | `github.com/Crozn1812/insighthub_devops` | Public, đã kiểm. Evidence `ev-repo-insighthub-rag` |
| Repo Azure | `github.com/Crozn1812/azure-api-gateway-dsr-ai` — **bản demo**, bản chính thức gửi sau | Lead **giả định** là Partner Data Gateway Azure (dự án Azure duy nhất trong §2.2) — cần Duy xác nhận. Evidence mức Lab, ghi rõ không phải hệ thống thật tại công ty |
| Kinh nghiệm | Dự án Azure làm cho HPT từ đầu tháng 7 | **Chưa khớp**: nếu là 07/2026 thì tới 11/2026 ≈ 4 tháng, không phải 6. Cần năm bắt đầu + có được nêu tên HPT công khai không. Chưa đưa lên public |
| Máy tham chiếu | Đồng ý dùng máy dev có nhãn | ADR 0007 Accepted. T08: BLOCKED → **NOT RUN** |
| GitHub profile | Suy ra từ repo: `github.com/Crozn1812` | Đã điền `githubUrl` (nội dung vẫn draft) |
| CMS DevOps Platform AWS EKS | Chưa có thông tin | TBD |
| Số điện thoại | Chưa có | TBD |

### Bổ sung lần 2 — 2026-11-04

| Mục | Trả lời của Duy | Ghi chú Lead |
|---|---|---|
| RAM máy tham chiếu | 32 GB | ADR 0007 đã sửa |
| Repo Azure | Đúng là bản demo Partner Data Gateway; tài liệu đầy đủ gửi sau | Giả định cũ được xác nhận; evidence mức Lab giữ nguyên |
| Kinh nghiệm | Thực tập từ 07/2026, dự kiến hoàn thành lộ trình 12/2026; mục tiêu Fresher/Junior khi apply | Hiện ghi **Intern**; không ghi "6 tháng" trước 12/2026. Đổi cấp độ chỉ khi Duy xác nhận hoàn thành. Có được nêu tên HPT công khai không: **vẫn TBD** |
| CMS DevOps Platform AWS EKS | Bổ sung sau | TBD |
| Repo GitHub cho The Quiet Atlas | "oke" — chưa có tên repo | Vẫn chờ |
| Cách giao việc | Chạy đợt 6 xong nối luôn đợt 7 trong một lần | Áp dụng 2026-11-04 |

## Cloud, tên miền

| Mục | Giá trị |
|---|---|
| Ngày đăng ký AWS | TBD |
| Ngày hết hạn credits | TBD |
| Paid plan | Chưa (chưa cần trước A2) |
| Tên miền / registrar | TBD |
| Resource cloud đã tạo | Không có |
