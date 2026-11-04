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

- Welcome đôi khi không hydrate trong lúc tải nặng (L3 thấy 2 lần) — theo dõi.
- Renderer info (`__tqaPerf`) chưa đo được vì UI không bật `debug`.

### Đợt 8 — Shell toàn màn hình + HUD góc (ADR 0009, Duy chốt 2026-11-04)

| Ticket | Người làm | Kết quả |
|---|---|---|
| L1-008 Shell toàn màn hình + HUD | Codex + Lead sửa font/canvas | **Merged** `f54407e`. Welcome = ảnh rừng 2D CSS/SVG toàn màn hình + thẻ góc dưới trái; Enter World phủ 3D toàn màn hình, HUD 6 nút (Quick, CV, Email, Sound, Menu, Thoát world). Duy duyệt qua ảnh chụp. Font đổi sang Times New Roman/Noto Serif/Liberation Serif (Georgia thiếu glyph tiếng Việt dựng sẵn) |
| L3-008 e2e theo bố cục mới | L3 subagent | **Merged** `48ac1a5`. Sửa selector menu/Exit, CV/email ở thẻ góc; thêm `full-viewport.spec.ts`: không cuộn, thẻ ở góc dưới trái, canvas = viewport, HUD 6 nút ≥ 24 px, Thoát world trả focus Enter World, axe 0 vi phạm (mọi mức) |

**Lead chạy lại trên main `48ac1a5`** (máy dev, Edge, server local): lint (0 warning), typecheck, unit 167, build:artifacts, check:cv/bundle/leaks/licenses exit 0; JS ban đầu `/en/` 140,4 KB gzip; e2e 128 passed / 1 skipped (Q21 đổi ngôn ngữ trong world — chưa có tính năng); test:perf EN+VI PASS (Welcome ~143 KB JS tối đa 3 lần lạnh, 0 request 3D trước Enter World, 3D → playable 1,71 MB / 2,07 s). Subagent chạy e2e 2 lần, không flaky. T08/T09 sau đổi bố cục: NOT RUN lại (chỉ helper đổi selector).

### Đợt 9 — Đổi ngôn ngữ trong world (§6.3, Q21) + dọn việc nhỏ

| Ticket | Người làm | Kết quả |
|---|---|---|
| L1-009 | Codex + Lead sửa câu aria-live theo ngôn ngữ | **Merged** `f525a9f`. Menu world có English/Tiếng Việt (`aria-pressed`); đổi tại chỗ HUD, menu, overlay, `replaceState` URL, `lang`, title; không remount canvas; Thoát world sau khi đổi → điều hướng `/<locale mới>/`. CV: "· demo" cạnh repo có evidence Lab. `preview.ps1` theo `$PSScriptRoot`. JS ban đầu `/en/` 140,6 KB |
| L3-009 | L3 subagent + Lead tăng timeout T07 | **Merged** `4f0c749`. 5 e2e Q21: en→vi, vi→en, giữ vị trí (khung hình đóng băng trùng byte, không tạo WebGL context mới), overlay đổi ngôn ngữ, thoát về `/vi/`; axe menu vi 0 critical/serious |

**Lead chạy lại trên main `4f0c749`** (máy dev, Edge, server local): lint/typecheck/unit 169/build:artifacts/check:cv/bundle/leaks/licenses exit 0; **e2e 133 passed, 0 skipped**; test:perf EN+VI PASS. Q21 (local): **PASS** phần quan sát được; "secret" chưa có trong world → NOT RUN. Lead cũng tự kiểm trên trình duyệt built-in.

Còn tiếng Anh trong world: nhãn "(placeholder)" và gợi ý "E — …" do `src/features/world` chèn (L2).

### Đợt 10 — Tổ chức 5 lane (CLAUDE.md §2–3), push GitHub, font, ngôn ngữ world, nháp nội dung

Repo đã push: `github.com/Crozn1812/the-quiet-atlas` (public). Trước khi push: quét lịch sử 55 commit theo mẫu secret phổ biến (không phải gitleaks) — 0 phát hiện; không có file nháp/mật.

| Ticket | Lane | Kết quả |
|---|---|---|
| L2-010 | L2 Content (subagent) | **Merged** `e81071d`. Điện thoại theo CV lên web + CV; `drafts.ts` tên công ty HPT (chưa lên public — schema chưa có trường kinh nghiệm). Nháp 4 case study + 3 phương án giới thiệu ở `content-private/drafts/` (gitignore, chờ Duy duyệt). Đề xuất schema `experience[]`, `education[]` — **chờ Lead duyệt hợp đồng** |
| L1-010 | L1 UI (Codex) | **Merged** `971ea57`. Noto Serif tự host (OFL, 4 file ~41 KB, preload 1 file), dòng `LICENSES.csv`; UI gửi `tqa:set-locale` + `locale` khi mount |
| L3-010 | L3 World (Codex) | **Merged** `bd2ece7`. Chữ world EN/VI (`copy.ts`), `tqa:set-locale`, `data-world-locale`; chunk world +606 B gzip |
| L5-010 | L5 Platform (subagent) | **Merged** `a8339f9`. 4 runbook cho Duy (`docs/runbook/aws-*.md`, `domain-and-acm.md`); workflow lên action Node 24, chỉ rõ Chrome cho lhci. Terraform: **BLOCKED** (máy chưa có terraform; `infra/` chưa có file `.tf`) |
| L4-010 | L4 QA (subagent) | **Merged** `97cedf7`. Timeout 30 s cho contract test (CI chậm); e2e chữ world theo ngôn ngữ; T11 font tự host |

**CI GitHub run #1** (commit `3e24151`): **FAIL** ở bước unit test — `contract.test.ts` timeout 5 s trên runner (local 2,4 s). Các bước sau chưa chạy trên CI → NOT RUN. Đã sửa ở L4-010.

**CI run #2 (`ed116ea`) và #3 (`74db86b`)**: install, lint, typecheck, **unit test, build, check-bundle, scan-leaks: PASS trên CI**; **gitleaks: FAIL** (lần đầu gitleaks thật sự chạy trên toàn lịch sử). Log chi tiết cần đăng nhập GitHub; máy local không chạy được gitleaks (chưa cài, Docker Desktop không khởi động). Run #3 đã allowlist theo đường dẫn các giá trị mẫu cố ý của bộ quét — vẫn FAIL → nguyên nhân thật **chưa biết**. Licenses, e2e, perf, Lighthouse trên CI: NOT RUN (bị chặn sau gitleaks). Cần Q-21.

**L4 full suite trên lane (= main `97cedf7` trừ docs)** — máy dev, Edge: lint 0, typecheck 0, unit 172/172, build:artifacts 0, **e2e 137 passed / 0 skipped** (lần 1 có 1 fail do test so khung hình chưa ẩn nhãn world đã dịch → sửa test, không phải lỗi sản phẩm), test:perf EN+VI PASS (Welcome 184,6/190,7 KB; JS 143,3 KB / 150 — còn ~6,7 KB; 0 request 3D trước Enter World; 1,71 MB / 2,07 s tới playable).

| Gate | Trạng thái | Bằng chứng |
|---|---|---|
| T08 Low | **PASS** 3/3 (100 FPS vsync, p95 10,2 ms) — máy dev dGPU, không phải iGPU | `docs/evidence/B1/t08-t09-2026-11-04-b10.md` |
| T09 | **FAIL** 2/2 — "world still rendering" trượt: rAF tụt đều ~1 Hz giữa chừng; heap/DOM/WebGL ổn định (không thấy rò rỉ). Nghi môi trường, **chưa chứng minh** | như trên |
| Q21 | PASS phần tự động (đổi ngôn ngữ UI + world, cùng canvas, khung hình trùng) | e2e `world-input.spec.ts` |
| T11 font | PASS phần tự động (Noto Serif tải từ `/fonts/`, không font ngoài) | e2e `fonts.spec.ts` |

### Đợt 11 — Sửa lỗi: gitleaks CI, hồi quy Lighthouse, T09, kinh nghiệm/học vấn

Duy cấp quyền bypass; Lead chọn model theo độ khó: Codex **gpt-6.1-sol high** (L1-011 chẩn đoán hiệu năng), subagent **sonnet** (L2-011, L5-011 việc rõ ràng), subagent **opus** (L4-011 e2e/harness khó).

| Việc | Kết quả |
|---|---|
| Gitleaks CI (run #2–#3 đỏ) | Lead tải gitleaks v8.28.0 chính thức (SHA-256 khớp checksums release) → 20 dương tính giả: 19 là giá trị mẫu cố ý của bộ quét (allowlist theo đường dẫn), 1 là spec §4.6 mô tả tiền tố ARN (`.gitleaksignore` theo fingerprint). Local: 0 phát hiện. CI run #4: gitleaks, licenses, e2e, load budget **PASS** |
| Lighthouse CI (run #4 đỏ: TBT `/en/` 461 ms) | Lead bisect → **L1-008 `f54407e`** gây hồi quy. **L1-011** (`c5c6951`) sửa: bỏ probe WebGL trên thiết bị Editorial, cache. TBT `/en/` 73 ms, mọi URL PASS. Quy trình: thêm `perf:lhci` + `check:gitleaks` vào kiểm full (`docs/runbook/full-check.md`, L5-011 `6719d7f`) |
| Lỗi sản phẩm L4 tìm thấy | Retry thất bại đồng bộ → focus rơi về `<body>` (do L1-011 bỏ focus tường minh). Lead sửa (`6bbd19b`): bộ đếm lỗi trong deps effect focus; test (a) PASS |
| T09 (FAIL đợt 10) | **PASS** với cờ chống Windows occlusion + log visibility (L4-011 `d910eda`); T08 Low xác nhận không đổi |
| L2-011 (`3768275`) | Schema `experience[]`/`education[]` (ADR 0010), dữ liệu HPT (Intern 07/2026 – nay, mô tả TBD) + PTIT (2027), CV có mục Kinh nghiệm/Học vấn. Web chưa hiển thị (ticket L1 sau) |

**Kiểm full (L4, main `33c27b5`)**: 12/12 bước exit 0 — unit 196, e2e 142 (gồm 5 test rủi ro L1-011), test:perf, gitleaks 3/3, lhci. Sau bản sửa focus, Lead chạy lại lint/typecheck/unit/build/check:bundle + e2e liên quan Enter World (110 passed). Bằng chứng: `docs/evidence/B1/t08-t09-lhci-2026-11-04-b11.md`.

**Lighthouse trên CI (run cho `b38289c`)**: vẫn FAIL ở `/en/` lần chạy chậm nhất (TBT 232 ms, LCP 2565 ms; runner benchmarkIndex ~2000–2450, máy dev ~3500). Thêm bước workflow in assertion ra annotation công khai (`b38289c`).
**L1-012** (Codex BLOCKED: sandbox không mở được Edge → chuyển subagent opus; `b75b568`): LCP Welcome do task hydrate của chunk framework; sửa: tiêu đề Welcome weight 400 (không tải font 700 ở trang đầu), `not-found` dùng `<a>` thay `next/link` (bớt ~6 KB JS mọi trang), Quick không còn import `WorldEntry`. JS ban đầu `/en/` 140,9 → 134,6 KB. CPU×8: LCP Welcome 2143–2213 ms; TBT 139–201 ms — **chưa đạt mục tiêu nội bộ 150 ms**, sàn do Next/React (trang privacy không có client component cũng 130–195 ms).
**L4 kiểm full trên `b75b568`**: 12/12 exit 0 (unit 200, e2e 142, gitleaks 81 commit, lhci worst TBT 73 / LCP 2217 ms).
**CI GitHub run 41776742732 trên `b75b568`: SUCCESS — CI xanh lần đầu** (lint → gitleaks → e2e → perf → Lighthouse).

### Đợt 12 — Nội dung thật từ câu trả lời của Duy, Quick hiện Kinh nghiệm/Học vấn, Terraform nháp

Model: L1-013 Codex **gpt-6.1-sol medium** (UI rõ ràng, không cần trình duyệt); L2-012 subagent **sonnet**; L5-012 subagent **opus** (IAM/bảo mật); L4-012 subagent **sonnet**. Lead đo Lighthouse sau merge L1.

| Commit | Việc |
|---|---|
| `0b86afe` L2-012 | Profile (LinkedIn, câu giới thiệu A "Cloud DevOps Engineer", summary HPT), 4 case study EN+VI `status: completed`, `reviewStatus: draft`; PDG = "Secure Partner Data Sharing Portal" (slug giữ); evidence song ngữ `claimEn/scopeEn/descriptionEn` (ADR 0010 mở rộng); grep 27 từ khóa nội bộ PDG: chỉ trùng tên repo demo (Duy chọn không đổi, Q-15c). AWS pipeline theo README (Q-16 chưa trả lời) |
| `b768e82` L1-013 | Quick: mục Experience/Kinh nghiệm + Education/Học vấn (Server Component); evidence theo locale; tên Welcome đậm lại (Q-22, font 700 không preload) |
| `af45a66` L5-012 | Terraform nháp: bootstrap (state, OIDC, 3 role), module static-site/dns/monitoring, envs/prod; `check:terraform` (fmt/init -backend=false/validate) + job CI. **Không plan/apply.** DEFERRED: tflint, Checkov/Trivy, plan, Free plan subscription (thủ công) |

**Lighthouse sau L1-013 (Lead, máy dev)**: mặc định `/en/` TBT 44–58, LCP 2204–2213 ms; CPU×8 TBT 131–156, LCP 2285–2311 ms (không tệ hơn đợt 11).
**Kiểm full (L4, main `af45a66`)**: 13/13 exit 0 — unit 227, e2e 142, test:perf 2, gitleaks 3/3 (89 commit), terraform 7/7, lhci worst `/en/` TBT 42 / LCP 2201 / CLS 0,012. Quick EN không còn câu tiếng Việt ở evidence; heading h1→h2→h3 hợp lệ.
**CI GitHub run 41828064480 trên `dc8fc19`: FAIL ở Lighthouse** — `/en/` TBT 246/96/104 ms (`pessimistic` lấy 246 > 200). Lần chạy xấu có runner chậm bất thường (benchmarkIndex 1893, bootup 479 ms; hai lần kia ~2440, ~250 ms). Mọi bước khác và job terraform PASS. Cùng kiểu với đợt 11 (232 ms). Không nới ngưỡng; hướng xử lý: giảm hydrate của Welcome (ticket L1-014).

### Đợt 12b — L1-014 (BLOCKED): sàn TBT là runtime Next/React

- Subagent opus trace CPU×10: task lớn nhất là nạp/khởi tạo module framework (~22 ms thực ≈ 220 ms giả lập, ~54% là khởi tạo module react-dom/router), giống nhau ở `/en/`, `/en/quick/` và `/en/privacy/` (0 client component). Hydrate `WorldEntry` đã chia lát 5 ms, gần như không góp TBT. CPU×10: `/en/` 180/216/184, `/en/quick/` 176/186/175 ms. Không sửa code (không có lợi ích đo được).
- Lead thử `next build --webpack`: CPU×10 TBT 176–217 ms (không cải thiện), LCP ~2,19 s (tốt hơn ~150 ms). Không áp dụng.
- Kết luận: CI đỏ khi runner chậm bất thường (benchmarkIndex ~1900) vì `pessimistic` lấy lần xấu nhất trong 3 lần. Không phải hồi quy. Cách xử lý thay đổi phương pháp đo → **Duy quyết (Q-24)**; Lead không tự đổi.
- **Duy chọn A (Q-24) → ADR 0011**: `lighthouserc.cjs` 5 lần, LCP/CLS/TBT gate theo `median-run`, ngưỡng giữ nguyên; bước annotation CI chạy mọi lần, lần vượt ngưỡng in `warning`. Local `pnpm perf:lhci` 15 lần đo: exit 0.
- **CI GitHub run 41834317599 trên `a93b92a`: SUCCESS** (cả job terraform). Lần này runner nhanh (benchmarkIndex ~3400–3500, một lần 2438): `/en/` TBT 44–63, LCP 2199–2270 ms. Chưa gặp lại runner chậm (~1900) để kiểm phương pháp mới trong trường hợp xấu.

### Đợt 13 — Duyệt trang lượt 1 (Q-04)

- Duy trả lời Q-16 (lúc đầu EventBridge, sau chốt "theo repo GitHub": code dùng S3EventSource → S3 gọi Lambda trực tiếp; dữ liệu giả lập), Q-10 (laptop i5-13500H Iris Xe → ADR 0007).
- L2-013 (subagent sonnet, aed8327): chức danh chốt "CloudDevOps Engineer"; AWS trigger theo repo; InsightHub bỏ chi tiết nghiệm thu; CMS viết theo slide (bỏ câu mức bằng chứng ở summary); PDG chỉ nói hai luồng dữ liệu cloud và on-premises, không nêu nguồn dữ liệu. Unit 231 PASS, check:cv/leaks PASS. Lead sửa test có ký tự điều khiển (fbf7a4d).
- Bản xem thử local: localhost:4180 (out/ build mới). Nhãn Draft giữ tới khi Duy duyệt OK từng trang.

### Ticket tiếp theo (nháp, chưa giao)

- Duy: duyệt từng trang (Q-04) — Lead gửi link xem thử local; còn Q-16 (AWS pipeline), Q-10 (mã CPU laptop).
- L3 (B2, sau A2): chọn nhạc CC0/giấy phép rõ ràng theo art direction (Q-11).
- L5: tflint + Checkov/Trivy (ghim phiên bản/SHA) trước A2 apply.
- L1: hoãn probe WebGL trên desktop tới lúc rảnh.
- Lead: dư địa TBT ở CPU chậm nằm ở runtime Next/React — cân nhắc cấu hình Next (ADR mới) nếu CI chập chờn lại.
- Quy trình: việc cần mở trình duyệt để đo (Lighthouse/trace) giao subagent, không giao Codex (sandbox chặn Edge).
- L3/L4: chạy lại T09 có người giữ cửa sổ Edge; nếu vẫn tụt 1 Hz thì điều tra (visibility, efficiency mode).
- Chữ world tiếng Việt chưa được duyệt biên tập.
- L2-008: Atlas Journal (J) §7.2 — chỉ cần sau khi có thêm khu; hoặc bắt đầu B2 khi A2 live (§12: B2 chỉ sau A2).
- A2 (cloud): **chưa bắt đầu** — cần Duy: repo GitHub, ngày đăng ký AWS, Paid plan, tên miền.
| L3-001 CI PR + check-bundle | L3 subagent | **Merged** (341c93f). Lead chạy lại: lint/typecheck/test/build exit 0; `pnpm check:bundle` PASS trên scaffold; fixture rò marker → exit 1. Workflow GitHub: NOT RUN (chưa có remote) |

Lưu ý ngân sách: scaffold rỗng đã dùng **135,3 / 150 KB** JS gzip (không tính script `noModule` 38,6 KB chỉ trình duyệt cũ tải). L1 còn ~15 KB cho client component — ưu tiên Server Component, không thêm thư viện client.

## Chưa có

- Remote GitHub (repo public — Duy tạo hoặc giao Lead).

## Blocker thật

| # | Blocker | Ảnh hưởng | Cần ai |
|---|---|---|---|
| ~~B1–B3~~ | ~~Thiếu git/node/pnpm/codex~~ | Đã cài 2026-11-03, xem `docs/runbook/setup.md` | — |
| ~~B4~~ | ~~Chưa có git identity~~ | Đã đặt global theo lựa chọn của Duy (Gmail) | — |

## Gate

Trạng thái gate mới nhất: xem bảng "Gate cập nhật" và "Đợt 8" ở mục Đã có. Gate không nêu ở đó: **NOT RUN**.

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

### Bổ sung lần 3 — 2026-11-04 (trả lời danh sách câu hỏi)

Chi tiết và việc còn chờ: `docs/DUY_QUEUE.md`. Tóm tắt: Lead soạn câu giới thiệu; được nêu tên HPT; Duy gửi tài liệu PDG, CMS, InsightHub và CV (lưu ngoài repo); nội dung dự án do L2 soạn nháp, Duy duyệt từng trang; điện thoại hiện cả web theo CV; LinkedIn **không có trong CV** → Q-01; repo `github.com/Crozn1812/the-quiet-atlas` (public) đã tạo; AWS: tài khoản mới, chờ credit; tên miền chưa mua; đồng ý font tự host + sự kiện ngôn ngữ world; định hướng hình ảnh: `docs/art/direction-notes.md`. Từ đợt 10: tổ chức 5 lane (CLAUDE.md §2–3).

## Cloud, tên miền

| Mục | Giá trị |
|---|---|
| Tài khoản AWS | Tài khoản mới, đang chờ credit free (2026-11-04) |
| Ngày đăng ký AWS | TBD |
| Ngày hết hạn credits | TBD |
| Paid plan | Chưa (chưa cần trước A2) |
| Tên miền / registrar | TBD |
| Resource cloud đã tạo | Không có |
