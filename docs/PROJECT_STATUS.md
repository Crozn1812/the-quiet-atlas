# PROJECT_STATUS — The Quiet Atlas

## Playtest Duy 20/11 — QF-01..08 (Claude-Lead, 20/11 21:30)

Duy chơi demo và gửi 9 mục. ADR 0020 (xe tự do, chỉ Low/High).

| Ticket | Việc | Trạng thái |
|---|---|---|
| QF-01 | Bỏ Balanced, chỉ Low/High | merged 3ca90dc (Codex A) |
| QF-02 | Xe lái tự do, qua cầu | merged 5c054f4 (Codex A; Lead cho phép lái khi cruise) |
| QF-03 | Intro High chờ cảnh dựng xong (trần 8 s) | merged 5c81ca7 (Codex C) |
| QF-04 | Cây sồi cổ thụ Roots | trả lại vòng 1 (dáng cành); Codex C hết lượt tới 23:15, tự chạy lại |
| QF-05 | Đá ven biển HR + **sửa adaptive quality tụt High→Low** | merged d720110 (Lead) |
| QF-06 | Piano chơi bằng bàn phím ở Quiet Shore | merged 4d731ba (Lead) |
| QF-07 | Tàu đắm ngoài khơi có khói | trả lại vòng 1 (khói thành chuỗi chấm); thân tàu đạt |
| QF-08 | Ảnh Welcome + 8 ảnh khu chụp lại ở High | merged a9ba2b4 (Lead); chụp lại Roots sau QF-04 |

Nguyên nhân gốc của "ảnh/intro thô": adaptive quality hạ High→Low vài giây sau khi vào (giật lúc stream tài nguyên làm p95 > 33 ms), trong khi máy chạy ổn ~100 FPS. Giờ chỉ đánh giá khi thế giới dựng xong và cần 3 cửa sổ liên tiếp có cả median lẫn p95 chậm.

| Kiểm tra (main a9ba2b4 trừ ảnh) | Kết quả |
|---|---|
| gate merge (lint, typecheck, assets, licenses, unit 2034) | PASS |
| e2e world (48) trên main 4d731ba+QF-02 | 42 PASS, 6 FAIL vehicle (timeout build khi máy tải nặng); chạy riêng vehicle: 5 PASS + 1 FAIL, chạy lại ca đó PASS → FLAKY dưới tải |
| Sửa e2e vehicle (QF-E2E, b152e4c): dựng cảnh ở Low trước khi chờ; phanh cho phép lùi | world 46/48 (1 FAIL phanh đã sửa, 1 timeout dưới tải 2 worker); vehicle chạy riêng 6/6 PASS |
| Next.js 16.4.6 (31820d0, Duy duyệt 20/11) | build 3/3 không còn SecurityFatalError; unit 2033 PASS; e2e 157 PASS + 6 FAIL vehicle (đã sửa ở QF-E2E) |
| e2e piano + content | PASS (5) |
| FPS High nhân vật mới | NOT RUN |

Next.js đã nâng 16.4.6 (WASM: AppData/Local/next-swc/wasm-16.4.6/package). Không có tài khoản Codex E (Duy 20/11).

## HR-FACELESS — 19/11 01:00 (Claude-Lead)

Duy (18/11): nhân vật mặt trơn, tóc rẽ ngôi sắc nét theo ảnh tham chiếu. Lead tự làm (`hr-faceless.py`), merge c49e62d (Duy chọn merge rồi sửa tiếp tóc).

| Kiểm tra | Kết quả |
|---|---|
| lint, typecheck, assets, licenses, unit 2057 | PASS (gate merge) |
| build | PASS |
| e2e world 43 | PASS (W-E, 4205; lần đầu 31 lỗi ENOENT do hai lượt e2e chồng nhau, chạy lại riêng PASS) |
| FPS High với nhân vật mới | NOT RUN |

Nhân vật LOD0 16,7 MB / 630k tam giác (trước 5,8 MB / 98k), chỉ báo cáo (ADR 0019). Tóc trong game còn mượt, chưa dày/rối như ảnh mẫu: đang sửa (HR-FACELESS-2). Bằng chứng: `D:/tqa-worktrees/evidence/HR-FACELESS/`. Next.js 16.4.4 báo lỗ hổng đã công bố khi build (build lại thì qua); đề xuất nâng, chờ Duy.

## HR-FACE dừng — 17/11 12:00 (Claude-Lead)

HR-FACE (mặt nhân vật theo ảnh Duy) qua 3 vòng không đạt. Duy chọn demo với mặt MakeHuman hiện có, không merge HR-FACE. Mã game trên main không đổi kể từ af49ccd, nên gate cuối và showcase `40-demo` bên dưới vẫn đúng cho bản demo.

## Gate cuối và demo — 16/11 16:00 (Claude-Lead)

Tất cả ticket HR đã merge. Commit cuối: **af49ccd** (HR-CHAR-B: tóc nhiều lớp, áo, tay nắm ghi đông). Showcase demo: `docs/showcase/40-demo/`; ảnh tổng `sheet-high.webp` và `sheet-low.webp`, phiếu chấm `checklist.md`, bằng chứng trong `checks/`.

| Gate | Kết quả | Bản build |
|---|---|---|
| build | **PASS**. Lượt đầu thoát -1073741502, do một build cũ vẫn chạy chồng lên; build lại một mình thì PASS | af49ccd |
| full e2e (cổng 4191, `--workers=2`) | **PASS 158/158** | af49ccd |
| FPS High, Edge, RTX 3060, 52 góc | **PASS**: thấp nhất 65,6 (first-light-overview), 71,4 (first-light-path); Roots 100; 47/52 góc ≥ 99,7 | af49ccd |
| showcase | **PASS**: 62 ảnh, 15,2 MB; console 0 lỗi. Tổng asset tải trong phiên: 741 request, 625 MB (chỉ báo cáo, ADR 0019) | af49ccd |
| bundle, leaks, cv, terraform validate, assets, licenses, gitleaks, load budget, Lighthouse | **PASS**. Chạy trên bb4f4de, trước HR-CHAR-B; HR-CHAR-B chỉ đổi nhân vật và tool | bb4f4de |
| journey (ADR 0017) | **FAIL theo test**: 242,6 s > 240 s. **Duy chấp nhận** (Q-52) | bb4f4de |
| T08/T09 Iris Xe | **NOT RUN** (chỉ Duy) | — |

**Lead thấy trên ảnh, để Duy chấm:**
- First Light: phía trên vách đá có mảng xanh đậm phẳng.
- Milestones: tượng trắng như ma-nơ-canh.
- Chim vẫn như thú bông (Q-53).
- Đồi Horizon nhìn gần còn trơn.
- Bọt sóng còn mép sáng thẳng.

## Đợt siêu thực (HR) — cập nhật 16/11 05:00 (Claude-Lead)

**Merge thêm từ 15/11 04:50.** Gate là lint, typecheck, unit, assets, licenses, chạy trên main khi merge. e2e world do Lead chạy trên cổng 4191 sau khi build lại.

| Commit | Ticket | Kiểm tra |
|---|---|---|
| b904135 | HR-GROUND | gate PASS |
| c536ec6 | HR-SKY: mây nhiều lớp, bầu trời vật lý | gate PASS (unit 2020/1 skip); e2e world 43/43 |
| 735f764 | HR-SHORE-TREES | gate PASS |
| 6e6d493 | HR-AUDIT: 25 lỗi A01–A26 (`tests/review/HR-AUDIT.md`) | gate PASS |
| da65e86 | HR-FIX-WOOD | gate PASS; +20 MB |
| 35873e9 | HR-FIX-FOLIAGE | gate PASS; e2e world 43/43 |
| 08c5805 | HR-FIX-SETPIECE (subagent): lò lửa, piano, hộp thư, biển chỉ đường, gương xe | gate PASS (unit 2036/1 skip); e2e world 43/43; +9,75 MB CC0 |
| e571bc1 | HR-FIX-WATER (subagent): suối, bọt sóng, thác, cá, chim | gate PASS; e2e worker 43/43 (cổng 4206) |
| 4a3fa22 | HR-FIX-TERRAIN (Codex C): núi xa có gờ đá, vách đá có thớ đứng | gate PASS (unit 2039/1 skip); e2e worker 43/43 (cổng 4203); High thấp nhất 65,56 FPS |

e2e world của Lead trên e571bc1 + 4a3fa22: đang chạy.

**Đang làm:**

| Ticket | Người làm | Slot | Nội dung |
|---|---|---|---|
| HR-CHAR | subagent 1 | W-E | nhân vật siêu thực |
| HR-WATER-B | subagent 2 | W-F | bọt sóng còn thành vệt loang, thác còn phẳng, chim như thú bông, vây cá |
| HR-SETPIECE-B | subagent 3 | W-G | lõi lửa còn trắng, khung chòi Quiet Shore, gương xe |
| HR-HILL | Codex C | W-C | đồi gần Old Trail còn đá xếp thành hàng |

**Codex:** A và B giới hạn tuần đến 20/11; D hết credit; C dùng được.

### Cập nhật 16/11 12:00

**Merge thêm:**

| Commit | Ticket | Ghi chú |
|---|---|---|
| 81e09bc | HR-SETPIECE-B | Lửa cam, chòi gỗ, vỏ gương |
| fb3c867 | HR-HILL | Đồi hết đá xếp hàng |
| 8bd2ae5 | HR-CHAR | Nhân vật siêu thực MakeHuman CC0. Build + e2e 43/43 do Lead chạy |
| bb4f4de | HR-WATER-B | Bọt ren, thác tách dải, vây trong mờ |

**Đang dở:** HR-CHAR-B. Áo và tay nắm ghi đông đã đạt; tóc bị trả vòng 1. Codex C bị giới hạn ngắn hạn, tự chạy tiếp lúc 14:43.

**Gate trước khi chốt, chạy trên main bb4f4de, máy rảnh:**

| Kiểm | Kết quả |
|---|---|
| full e2e (`--workers=2`, cổng 4191) | **PASS 158/158** (7,7 phút). Các lỗi e2e trước đây chỉ do máy tải nặng |
| check:bundle, check:leaks (R5 bỏ qua vì chưa có denylist), check:cv, check:terraform (validate 7/7, không apply), check:assets, check:licenses (251 file) | **PASS** |
| gitleaks v8.28.0 (binary chính thức, checksum khớp) | Lượt đầu FAIL: 685 + 36 phát hiện, Lead đã kiểm từng nhóm, toàn bộ là dương tính giả (dấu thời gian Lighthouse/CPU profile, byte GLB, regex trong `.tf`, ticket trích dẫn). Allowlist đúng các đường dẫn đó, luật giữ nguyên → **PASS 3/3** |
| test:perf load-budget /en/, /vi/ | **PASS**. 0 request 3D trước Enter World. Thời gian tới chơi được ≤ 7,61 s; 3D 2,16 MB tới chơi được (chỉ báo cáo) |
| perf:lhci | Chạy xong (chỉ báo cáo). LCP /en/ ≈ 2,2 s |
| test:perf journey B2-210 | **FAIL** (sát nút). Test đã sửa theo ADR 0017 (trước đó vẫn dùng mục tiêu 5–7 phút cũ). Đo: cả tuyến 242,9 s (mục tiêu 200–240 s), Milestones 60,01 s (≤ 60 s); Workshop 37 s và Roots 49 s đạt; 0 lần kẹt. Hỏi Duy ở Q-52, không tự nới ngưỡng |

**Chưa chạy:**
- FPS High từng góc trên máy rảnh sau HR-CHAR-B — NOT RUN.
- Final showcase — NOT RUN.
- T08/T09 trên Iris Xe — NOT RUN (chỉ Duy).
- Journey chạy lại với ngưỡng ADR 0017 (12:10): **FAIL 1/5** theo test: cả tuyến 242,61 s (> 240 s); **Duy chấp nhận 16/11** (Q-52), không đổi ngưỡng test. Đạt: Workshop 36,9 s, Roots 48,9 s, Milestones 59,7 s, 0 lần kẹt.

## Đợt siêu thực (HR) — cập nhật 15/11 04:50 (Claude-Lead)

**Merge thêm từ 14/11 19:20** (Lead tự build lại + e2e world sau mỗi merge):
| Commit | Ticket | Kiểm tra trên main |
|---|---|---|
| 156d63c | HR-TREE1b: tre thật (3 kiểu bụi) | gate PASS (unit 1973/1 skip); e2e world lượt đầu **42/43**: `World /en/` timeout 20 s khi máy tải nặng; chạy lại `world.spec.ts` trên cùng build **2/2 PASS** |
| 8651de8 | HR-GD110: xe GD110 siêu thực từ Blender, 3,43 MB | gate PASS (unit 1988/1 skip); e2e world **43/43 PASS**; worker đo High khi lái 88–92 FPS (RTX 3060) |
| f3a8ca2 | HR-TERRAIN-CLIFF: vách dốc thành vách đá có gờ, relief, mép gồ ghề | gate PASS (unit 1998/1 skip); e2e world **43/43 PASS**; ABBA góc tán 70,5 → 67,6 FPS (−4,1%) |
| 5c3147d | HR-FAR: dãy núi xa thật, sương thung lũng | gate PASS (unit 2011/1 skip); e2e world 43/43 (cổng 4173, xem lưu ý) |
| 0cdcb06 | HR-PROPS2: hết cây/cỏ low-poly ở High; lá khô 5–15 cm | gate PASS (unit 2028/1 skip); e2e world lượt đầu 29 fail ERR_CONNECTION_REFUSED (server 4173 bị tắt khi worker khởi động); **chạy lại trên cổng riêng 4191: 43/43 PASS**. FPS First Light 38 ở một lượt đo có tải nền — đo lại ở gate cuối |

**Lưu ý e2e:** Playwright local tái dùng server đang chạy trên 4173. Các lượt e2e Lead của HR-TREE1b, HR-GD110, HR-TERRAIN-CLIFF, HR-FAR chạy trên 4173 khi worker cũng chạy, nên có thể đã chạy nhầm build của worker. Từ 15/11 07:30 Lead dùng cổng riêng và worker dùng 4201–4204. Full e2e gate cuối sẽ chạy trên cổng riêng để xác nhận lại.

**Đang dở:**
- **HR-PROPS2** (cây đồi/biển, cỏ, lá khô): vòng đầu đạt phần lớn. Trả vòng 1: phi lao ven biển trơ cành, lá lơ lửng, FPS 51–57 ở vài lượt. Đã chuyển từ C sang B; chạy lại lúc 07:02.
- **HR-FAR-B** (núi xa): HR-FAR đã qua 2 vòng trả, dãy núi đã có hình thật. Còn 4 điểm: màu bạc, tán đốm da báo, đỉnh kim lơ lửng, Milestones 52 FPS. Patch được giữ lại, chờ account rảnh.
- **HR-SKY** (mây/bầu trời vật lý): card sẵn, chưa giao.

**Năng lực Codex:** A và C chạm giới hạn TUẦN đến 20/11; D hết credit; chỉ còn B (giới hạn ngắn hạn, mở lại 07:00). Xem Q-49, Q-51.
**Chưa chạy:** gate cuối (full e2e, load/Lighthouse/ABBA, FPS High kể cả Roots 15 m, final showcase) — NOT RUN, làm sau khi các HR ticket xong. T08/T09 Iris Xe — NOT RUN (chỉ Duy).


## Đợt siêu thực (HR) — trạng thái 14/11 19:20 (Claude-Lead)

Duy chấm world `c8531eb` **4/10** và yêu cầu siêu thực; Duy bỏ mọi **trần** ngân sách (ADR 0019: số đo chỉ báo cáo; license, leak, không chunk 3D trước Enter World, lỗi console, e2e chức năng vẫn chặn). Main hiện `7026dac`, **chưa push** (push chỉ khi Duy duyệt).

**Đã merge hôm nay (mỗi ticket: gate PASS, e2e world 43/43 trên SwiftShader, Lead xem ảnh trước/sau):**

| Ticket | Commit | Trải nghiệm |
|---|---|---|
| BUDGET-OFF | b47ce2d | Trần → báo cáo; gate tính đúng giữ nguyên |
| FIX-PATCH | b90313c | Nền xa không còn đâm xuyên đường mòn |
| HR-TREE1 / HR-TREE2 | af5795c / 2fce72d | 12 cây khác nhau, bạnh rễ, dây leo, tầng dưới tán; không hai cây giống nhau đứng gần. Renderer phần mềm (SwiftShader/llvmpipe) giữ rừng dự phòng tĩnh |
| STREAM-C | c81f68f | Mép suối mềm theo độ sâu thật, đất ướt, phản chiếu trời |
| HR-STREAMBED | 64da0b5 | Sỏi nhiều màu, đá có rêu, rong lay, bọt kéo hạ lưu |
| MS-C2 | 10f2909 | Hình nộm Milestones gần thực, đang bước; mảnh chứng chỉ chỉ từ `certificates.json` (đã có: CCNA, VTI DevOps hàn vào ngực; dự định: AWS SAA, Linux/CEH lơ lửng) |
| HR-BIRDS / AUDIO-BIRDS | f56f214 / 7026dac | Chim bay, đậu, bay đi; hải âu; tiếng chim **thu âm thật CC0** (Wikimedia Commons, 5 loài, nguồn ở `assets/audio-src/birds/SOURCES.md`) |
| HR-CLIFF | c7a6d3f | Vách First Light thành đá phân tầng thật (+13,2 MB, nạp deferred) |
| HR-SEA | bf701ab | Biển hoàng hôn: vệt nắng, màu theo độ sâu, sương chân trời; giữ sóng SURF-01 |

**Đang làm:** HR-ROOTS-SIGN vòng 2 (B, hết lượt tới 20:58, tự chạy lại 21:00), PERF-HR (C, hết lượt tới 21:02, tự chạy lại 21:03), SEA-TESTS (A). Chờ: HR-LIGHT, rồi gate cuối + showcase 39-final.

**Số đo đáng chú ý (báo cáo, không chặn):**
- High toàn cảnh trên RTX 3060 sau HR-TREE2/STREAMBED/CLIFF/BIRDS: **19,4 FPS**, ~380 draw, ~5,96 triệu tam giác/frame (bàn giao HR-BIRDS). Low 99,9 FPS. → PERF-HR mục tiêu ≥ 60 FPS High mà không giảm chất lượng nhìn thấy.
- Low tới lúc chơi được (đo riêng, HR-CLIFF): trung vị 14,0 s.
- Unit trên main: 1898 passed / 1 skipped. HR-SEA viết lại test biển (1911 → 1882), SEA-TESTS đang rà khôi phục bất biến còn đúng.

**Chưa chạy:** full e2e (mọi suite), load/Lighthouse/CPU ABBA cuối, showcase 39-final — **NOT RUN** cho tới khi HR xong. T08/T09 Iris Xe **NOT RUN** (Duy). Duy chưa chấm lại đồ họa sau đợt HR.

**Sự cố:** mất điện ~13:00–15:58 (4 worker chạy lại từ worktree, không mất code). Codex D hết credit lần 2 (Q-49).

---


**Điều phối mới nhất (10/11):** Codex làm Lead + thi công RC-01 để Duy test toàn bộ. [Showcase 35 và audit](showcase/35-rc/README.md) · [Hướng dẫn test 20–30 phút](playtest/rc-guide.md). Clone `D:/tqa-worktrees/RC-01`, nhánh `lane/RC-01`; main hiện `d00bf20` (thêm tài liệu từ `3bb0752`, runtime chưa chứa RC), chưa push. `.git` main chỉ đọc: Claude-Lead sẽ fetch/duyệt/merge clone khi đủ gate theo [handoff](runbook/lead-handoff.md).

## RC-01 — đủ gate để Duy test local (2026-11-10)

R1 đã được nhân rộng trên main trước đợt này. Đã chụp lại 8 postcard và Welcome từ world R1; sửa build đủ CV/OG, ẩn nội dung nháp công khai, bố cục CV, camera bị biển chỉ đường kéo sát người, shader tạo wedge ngoài biển, vị trí hook QA cạnh ghế và gợi ý mascot chồng nút E. RC-10/11/15/16/17/18/21 giảm công việc mỗi frame, giữ ngưỡng hiệu năng. Không tạo nội dung/chứng chỉ/URL mới, không chạm cloud/credential.

- Audit Edge VI/EN 1600×900 + mobile giả lập390/320: 140/140 assertion PASS trên `d761a62`; đi bộ phím thật 367,91 s /1098,12 m /0 kẹt, 8 khu, không teleport/Shift. Đây là bằng chứng có phạm vi, không thay T10/playtest thật.
- Nguồn `4d627b1`: build, strict gate1753/1753 và full e2e153/153 (4 worker,3,3 phút) PASS. Lượt e2e đầu treo teardown server Windows được giữ; lượt dùng server ngoài exit0. Bundle/license/assets PASS. Lead đã mở8High, luma maxdelta0,001, intro4khung và ending sau sửa.
- RC nguồn đã kiểm: **`bbd85a7c336aa025f11f42d40a07ea8bdbea83f1`**. RC-21 bỏ Vector3 tạm và sửa sparse filter RC-18; RC-22 cache world sphere cho Mesh.raycast mặc định, giữ custom/recursive/instanced/skinned. Build, lint 0 warning, typecheck và strict gate **1759/1759 unit PASS**.
- CPU harness gốc trên `bbd85a7`, ABBA hai lượt mỗi bản Balanced: **PASS**. Delta Script/Task First Light+3,5/+5; Roots−15/−17; Workshop−11/−12 ms/s, trần+10. [Bốn log và số đo](showcase/35-rc/perf/cpu-final-summary.json). Baseline export144a02c có world source giống main3bb0752 (gitdiff đã kiểm). Các FAIL trước, gồm4d vàccd, giữ nguyên; diagnostic15s chỉ bổ sung, không dùng thay phép đo chuẩn.
- T08/T09 Iris Xe **NOT RUN**; T10/điểm1–5/âm thanh nghe thật/mobile thật **DEFERRED** cho Duy. [Runbook Iris Xe](runbook/t08-iris-xe.md).

| Kiểm trên RC nguồn `bbd85a7` | Kết quả và bằng chứng |
|---|---|
| Full e2e, 4 worker | **153/153 PASS**, 3,3 phút, exit0; [log](showcase/35-rc/checks/e2e-bbd85a7.txt) |
| Load-budget, 3 tải lạnh mỗi locale EN/VI | **PASS mốc RC ≤6 s /8MiB**, worst EN4,621 s /VI4,653 s; world2.128.915 B; [sáu lượt và kiểm trần6s](showcase/35-rc/checks/load-rc-summary.json) |
| Lighthouse 3 URL ×5 lượt | **PASS**, profile mobile/simulate slow4G/CPU4× được kiểm trong cả15 report. Worst LCP2350,23 ms, TBT49 ms, CLS0,01829; [tổng hợp và report gốc](showcase/35-rc/checks/lighthouse-summary.json) |
| CV / bundle / license / asset budget | **PASS**; [CV](showcase/35-rc/checks/cv-bbd85a7.txt), [bundle](showcase/35-rc/checks/bundle-bbd85a7.txt), [license](showcase/35-rc/checks/licenses-bbd85a7.txt), [asset](showcase/35-rc/checks/assets-bbd85a7.txt) |
| Render | Lead mở từng ảnh đủ8 khu High và15 ảnh intro/ending; luma lệch max0,001. Art/QA mở12 ảnh Welcome/Quick VI/EN desktop/mobile cuối; [gallery và giới hạn](showcase/35-rc/audit.md) |

Lượt Lighthouse đầu không tạo được báo cáo do kết nối browser debug; log BLOCKED được giữ. Lượt sau dùng Edge do Playwright quản lý qua CDP local, server gzip ngoài, không đổi profile/runs/assertions; exit0. Lượt e2e đầu treo teardown và các CPU FAIL cũng giữ nguyên theo nguồn, không ghi lại thành PASS.

Việc tiếp theo: Claude-Lead fetch nhánh clone, duyệt/merge main theo ngoại lệ handoff; Duy chạy [lộ trình và bảng điểm](playtest/rc-guide.md), đo Iris Xe riêng. Bằng chứng được commit sau mã nguồn, không thay runtime/assets/dependency của `bbd85a7`. Không push.

> Phần dưới giữ lịch sử đợt31 ngày08/11; trạng thái đang làm nằm ở mục RC-01 phía trên.

**Phản hồi mới của Duy (08/11): hình ảnh/UX/UI chưa đạt yêu cầu, chưa nghiệm thu.** Gate PASS ở đợt 31 chỉ là kết quả kỹ thuật. Bản mẫu **The First Light R1** đã sẵn sàng để Duy chấm gu tại `D:/tqa-worktrees/FirstLight-R1` (`lane/FirstLight-R1`): source `56d29d5`, báo cáo bổ sung `720e48e`. **Chưa merge mẫu lên main, chưa mở rộng sang 7 khu khác.** [Ảnh trước/sau và báo cáo mẫu](showcase/32-first-light-prototype/README.md).

FL-01: full unit **1703/1703 PASS** trên source mẫu, sau đó thêm test regression và compose **13/13 PASS**; lint/typecheck/build và render ba quality PASS, tải lạnh EN/VI worst **5,38 s**, bảy khu còn lại max luma delta **0,001155**. CPU **chưa đạt/chưa kết luận**, không ghi PASS: hai cặp đầu Workshop +12 ms/s (trần +10); cặp xác nhận đảo thứ tự +6, tổng ba cặp Script +10 / Task +10,33 ms/s. Giữ mọi số đo, cần xử lý/xác nhận gate trước nhân rộng. Duy đang chấm hình khối/màu/mật độ của mẫu; không dùng test PASS thay nghiệm thu thẩm mỹ.

## Đợt 31 — UX/UI hoàn thiện và kiểm tra cuối (2026-11-08)

Showcase và bản chấm: [docs/showcase/31-ux-final/checklist.md](showcase/31-ux-final/checklist.md). Kết quả chi tiết: [qa-final.md](showcase/31-ux-final/qa-final.md).

- Duy giao Codex tiếp nhận UX/UI. Thi công U-02 → U-03 → QA, sau đó theo yêu cầu mới chia 5 vai kiểm tra; tối đa 3 subagent cùng lúc, phép đo browser/GPU chạy riêng.
- U-02/U-03 và sửa accessibility merge `f20147d`: Welcome CTA rõ, ảnh biển mới, overlay tạp chí với ảnh engine 8 khu; chữ và nút dễ dùng trên màn hình hẹp, Close bám khi cuộn, nhãn Sổ Atlas/Đi tới… khớp nội dung.
- Sửa pause merge `7774ae8`: cảnh không tiếp tục thêm chi tiết sau Menu; dừng queue và giữ khung render khi paused, resize/quality vẫn redraw, resume bình thường. Giữ test ảnh giống từng byte. Sửa locator visited chỉ chấp nhận khác khoảng trắng, vẫn kiểm đủ tên/chủ đề/trạng thái.

| Gate trên main `7774ae8` | Kết quả |
|---|---|
| Lint 0 warning / typecheck / unit | PASS / PASS / **1697/1697 PASS** |
| Production build / full e2e | PASS / **151/151 PASS**, 4,2 phút |
| Audit Menu / Sổ Atlas / Đi tới… / Quick | **12/12 PASS**, 0 axe critical/serious, focus trap, reflow |
| Load-budget EN/VI, 3 lần mỗi locale | **PASS**, worst playable **5,337 s**; world **2.163.481 B / 8 MiB** |
| Welcome / Quick initial JS | **PASS**, 140.811 / 137.943 B; 0 request 3D trước Enter World |
| Lighthouse 15 lượt / 3 URL | **PASS**; LCP đại diện 2375/1803/2203 ms, TBT 70/47/49 ms, CLS ≤0,0446; accessibility 100 |
| CPU so main, Balanced cố định, 2 lần mỗi bản | **PASS**, chênh script −1/−7/−17 ms/s ở First Light/Roots/Workshop |
| T10 / playtest người thật | **DEFERRED**, Duy chấm |
| T08/T09 Iris Xe | **NOT RUN**; số đo dev không thay thế |

Lượt e2e đầu 149 PASS / 2 FAIL và CPU không pin quality bị lệch vẫn được lưu trong showcase, không đổi thành PASS hồi tố. Báo cáo cuối gắn đúng mã và phép đo thật. **Chưa push**, không chạm cloud/credential. Đồ họa hiện là bản mẫu; chờ Duy chấm gu trước sản xuất hàng loạt theo ADR 0014.

## Milestone hiện tại

| Track | Mốc | Trạng thái |
|---|---|---|
| A — Portfolio | **A1** xong ở local (nội dung đã duyệt, CI xanh). **A2 mở lại** (2026-11-05): credit 100 USD đã có (hạn 2027-05-05), tên miền `nhbduy.id.vn` đã mua | A2 chờ Duy: MFA + user hằng ngày (Q-20), Budgets (`aws-budgets.md`), nameserver (Q-38). Lead không chạm cloud |
| B — World | **RC-01 đủ gate máy dev** trên clone `lane/RC-01`, nguồn `bbd85a7`; chờ Claude-Lead duyệt/merge main | Duy test trải nghiệm/T10 và đo T08/T09 Iris Xe; chưa có kết quả người thật/laptop |

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
- Bản xem thử local: localhost:4180 (out/ build mới).
- **Duy duyệt OK, gỡ Draft (89cb527)**: profile + 4 case study `reviewStatus: approved`, `publicApproval: true`, `lastReviewedAt 2026-11-04`. Trang privacy: Duy duyệt câu đề xuất về hosting (CloudFront + S3, không access log; cập nhật trang trước khi bật thống kê/AI) → gỡ Draft (204cb57). Lint/typecheck/unit 231/build/bundle/leaks PASS; e2e a11y + a11y-keyboard + html-fallback 97 passed.
- **Kiểm full (L4, `89cb527`)**: 13/13 exit 0 — unit 231, e2e 142 (sửa 2 test kỳ vọng chức danh cũ, b2d802c), gitleaks 3/3 (104 commit), terraform 7/7, lhci 5 lần: `/en/` TBT median 42 / worst 50, LCP 2194 / 2203 ms. Không còn "Draft"/"SharePoint" trên các trang đã duyệt.

### Đợt 14 — Quyết định của Duy 2026-11-04: B2/B3 trước A2, taste brief, Fresher

- **ADR 0012** (Accepted): hoãn A2 tới khi có credit; làm B2 + B3 ở local; Track A đóng băng, gate A chạy trên mọi PR; Lead toàn quyền kỹ thuật/art; hàng đợi ticket + 5 Codex worker (`docs/tickets/queue.md`, `docs/runbook/codex-workers.md`); subagent chỉ 3 vai (Art Director, Perf Watcher, QA/spec).
- **ADR 0013** (Accepted — hướng): "Thế giới là một bức tranh. Ký ức là những tấm ảnh film." Taste brief nguyên văn: `docs/art-bible/taste.md`. `docs/art/direction-notes.md` đã bị thay thế.
- **ADR 0007** bổ sung: laptop ASUS Vivobook Flip i5-13500H Iris Xe là máy nghiệm thu chính thức T08/T09; desktop dGPU chỉ tham khảo; kiểm §3.4 ở chế độ laptop + tablet.
- **Nội dung**: chức danh "CloudDevOps Engineer · Fresher" (Welcome, Quick, CV, OG, world-content, JSON-LD `jobTitle`); mục kinh nghiệm HPT vẫn ghi "Cloud & DevOps Intern" (đúng sự thật). Email công khai giữ `duybao09012004@gmail.com` (Duy chủ ý).
- `docs/art-bible/refs/` đã gitignore. Duy đã lưu 16 ảnh vào đây (Q-28). Q-25 ghi đông scrambler, Q-26 không có bản thu, Q-27 ảnh thật dùng được (không rõ người chụp → minh họa).

### Đợt 15 — B2 nền tảng (2026-11-05)

5 Codex worker song song (gpt-6.1-sol; high cho shader/hình học, medium cho phần còn lại). 11 ticket merged trong một lượt — chi tiết từng commit: `docs/tickets/queue.md`.

- **Đồ họa**: bảng màu token; vật liệu toon ramp (bóng xanh/tím, không đen); paper pass (fog về màu giấy, hạt giấy tĩnh, vignette giấy) + sương phân lớp 3 dải và sương thung lũng. Low = render thẳng, 0 pass phụ. **Lead nối vào world** (`9e9867d`), sửa xung đột `crown-fade` ghi đè hook shader (có thể dùng nhầm shader cache).
- **Thế giới (logic/dữ liệu)**: suối chữ S 900 m, 8 khu, tuyến 1 109 m / **370 s** (Workshop 52 s, Roots 70 s, Milestones 87 s — đạt §7.1 ở mức thiết kế); heightfield theo suối 45 ô, 0 byte tải; biển chỉ đường dịch chuyển (ADR 0008 bổ sung `tqa:teleport-start/end`); Atlas Journal memory; xe GD110 arcade. **Chưa render** terrain/nước/cây mới — đợt 15b.
- **Ký ức**: khung ảnh film + trang tạp chí (server component, 0 JS client, chưa nối).
- **Pipeline asset**: Blender 5.2.3, KTX-Software 4.4.2 (chữ ký Khronos hợp lệ), FFmpeg 9.0.2, gltf-transform 4.5.1 (`docs/runbook/asset-tools.md`). Lead chạy thật: cây thông bpy 7,8 KB → meshopt 6,1 KB, 56 tam giác, `check:assets` PASS. `check:assets` **chưa nối CI**.
- Vitest giờ chạy cả `*.test.tsx`.

Kiểm trên main `2d75e5f` (máy dev, Edge): lint, typecheck, unit (tất cả world 72 test sau B2-003; toàn bộ 285+ trước khi merge B2-011/013), build, check:bundle PASS. E2E world (world-input, full-viewport, q15, overlay): 19 passed / 1 failed khi 5 worker đang chạy; test fail (Q21 thoát sau đổi ngôn ngữ) chạy lại riêng **3/3 PASS** → chập chờn do tải máy, theo dõi. **Full e2e, perf, Lighthouse: NOT RUN** cho đợt này. Lead xem trên trình duyệt: Low và High render đúng, 0 lỗi console; ảnh còn bạc màu — chỉnh ở vòng style frame. T08: NOT RUN.

### Đợt 15b + 15c (2026-11-05)

12 ticket nữa merged (chi tiết: `docs/tickets/queue.md`):

- **World thật thay cảnh thử 60 m** (B2-050, `98e01a9`): terrain theo suối streaming theo ô + collider heightfield, cây theo biome (collider thân cây 100 % ở mọi quality), suối dải lụa + biển (B2-017; **Lead sửa** mặt nước theo `waterLevelAt` vì nước y = 0 bị lòng suối thượng nguồn che), trời + ánh sáng bình minh → hoàng hôn theo vị trí, loang màu nước + nét mực High (B2-005). Spawn tại First Light.
- **Bàn dựng style frame** (B2-030, `tools/styleframes`, Vite riêng, không vào web): preset A/B/C × 2 cảnh, `t` tất định. Lead thêm nước, `paper.setFog`, loại trời khỏi fog (trời luôn bị phủ giấy), fog theo tỷ lệ thế giới 900 m (15/65 m của cảnh thử nuốt cả cảnh), dời cảnh biển ra cửa sông. **Màu chưa đạt** (sương còn bạc, biển xám) → chưa gửi Duy chọn.
- **Phác thảo nhân vật + GD110** (B2-035/036): script bpy trong repo, turnaround 3 góc; nhân vật trả lại 1 vòng (Art Director: ma-nơ-canh, thiếu mái, áo xám); Lead đổi turnaround sang Cycles + nền giấy cho hai bộ ảnh nhất quán. **Showcase cho Duy chấm: `docs/showcase/15-turnaround/checklist.md`.**
- Atlas Journal dialog (B2-040, chưa nối), cinematic mở đầu 22 s (B2-060, chưa nối), `check:assets` vào CI (B2-022).
- Lỗi quy trình của Lead: 2 commit (`d3f679c`, `7a8bea9`) vào main khi lint/test đang đỏ vì pipe/`;` nuốt mã thoát; sửa ngay ở `f20ce47`, `edccdd6`. Từ đó dùng script gate `set -e` trước mọi commit merge.

**Kiểm full gate A trên main `2fb77da`** (máy dev desktop dGPU RTX 3060, Edge 156 headless, server local): lint, typecheck, unit **465**, build:artifacts, check:cv/bundle/leaks/licenses/assets — **PASS**; e2e **142/142 PASS**; test:perf PASS 3/3 lần (Welcome JS 137,1/150 KB; 0 request 3D trước Enter World; 3D tới playable **1,73 MB** / 8 MB; time-to-playable xấu nhất **2,24 s** / 10 s); Lighthouse 15 lần đo, mọi assertion PASS. Lead xem world trên trình duyệt (High): render đúng, 0 lỗi console. **T08/T09: NOT RUN** (chưa đo FPS world mới; máy nghiệm thu là laptop Iris Xe). Chưa push.

### Đợt 16 (2026-11-05): style frame A/B/C

- **B2-031** (Lead + 1 vòng Art Director, `143bb8e`, `53913bc`):
  - Paper pass tone map chỉ cảnh 3D. ACES từng làm xám màu giấy, sương và fog; nguyên nhân chính của màu "bạc".
  - Fog và sương nhận màu qua API `setFog`/`setMist`. World bỏ đoạn vá shader bằng thay chuỗi của B2-050.
  - Biển chuyển sang màu ngọc lam; xa tan về màu kem lạnh, không còn dải ô-liu.
  - Không còn cây mọc dưới 0,8 m (biển, bãi).
  - Thông 3 tầng, cây lá rộng dạng cụm.
  - Đồi thung lũng cao 7–12 m (trước là 3–4 m; đổi test B2-011 và ghi lý do).
  - Ánh sáng: giảm đèn bán cầu theo đề xuất Art Director.
- **B2-037** (Codex, `7c370e8`): đường bờ cong, bãi cát, cửa suối mở ra biển.
  - Lead giữ lại màu thung lũng mà Codex đã xóa.
  - Lead cho lòng suối không bị nền khô Last Postcard chặn.
- **Lỗi quy trình lặp lại:** `7c370e8` vào main khi 1 unit test bàn dựng đỏ, vì gate nối `| tail` nuốt mã thoát. Đã sửa ở `4bdc00c`. Từ nay gate luôn chạy không qua pipe.
- **Showcase cho Duy chọn hướng:** `docs/showcase/16-styleframes/checklist.md`.
  - 6 ảnh WebP.
  - 6 video 18 s, chỉ ở local, không vào repo.
  - Art Director đánh giá C gần taste brief nhất.

**Gate A đầy đủ trên main `4bdc00c`** (máy dev RTX 3060, Edge headless):

| Kiểm tra | Kết quả |
|---|---|
| lint, typecheck, unit (471), build:artifacts, check:cv/bundle/leaks/licenses/assets | **PASS** |
| e2e | **142/142 PASS** |
| test:perf (3/3 lần) | **PASS**: Welcome JS 137,1/150 KB; 0 request 3D trước Enter World; 3D tới playable 1,73 MB / 8 MB; thời gian tới playable tệ nhất 2,23 s / 10 s |
| Lighthouse | **NOT RUN** đợt này |
| T08/T09 | **NOT RUN** |

Chưa push.

### Đợt 17 (2026-11-05): world theo hướng C, cinematic, Atlas Journal

- Quyết định của Duy:
  - **D-22:** Duy chốt sơ khởi là ổn; Lead chọn hướng C theo đề xuất Art Director.
  - **D-23:** turnaround nhân vật và xe giữ hết.
- **B2-038** (Lead, `4964fba`): world render theo hướng C.
  - Preset chuyển vào `src/features/world/art/direction.ts`.
  - Fog cỡ thế giới 40/260 m (trước dùng số thử 15/65 m).
  - Sương, viền và màu trời theo C.
- **B2-043b** (Codex + Lead, `35e4283`): cinematic 22 s mỗi lần Enter World.
  - Có Skip, Esc cũng bỏ qua được.
  - Reduced motion: fade giấy 0,4 s.
  - Lead sửa: sương nền theo C; Esc không bị menu bắt; fixture e2e bỏ intro cho các spec gameplay và T08/T09.
- **B2-043a** (Codex + Lead, `e96d143`): Atlas Journal trong world.
  - Phím J hoặc menu; mở sổ thì world dừng (pause reason `journal`).
  - Sổ trống mỗi phiên, không lưu tiến trình.
- **B2-039a** (Codex + Lead, `0c2c184`): 3 dáng thông + 2 dáng lá rộng. Lead nối hiệu ứng làm mờ tán theo từng biến thể.
- **Lead review cinematic** (`9891cb9`): ảnh chụp cho thấy 3 lỗi mà unit test không bắt được.
  - Cảnh trên cao trắng xóa vì fog. Sửa: fog kéo dài khi bay cao.
  - Mép ô đất hình chữ nhật lộ ra. Sửa: tải trước 600 m và mặt nạ hành lang giấy.
  - Cận suối nhìn vào đầu nguồn bị cắt. Sửa: nhìn xuôi dòng.
- Showcase: `docs/showcase/17-world-c/checklist.md`.

**Gate A đầy đủ trên main `9891cb9`** (máy dev RTX 3060, Edge headless):

| Kiểm tra | Kết quả |
|---|---|
| lint, typecheck, unit (505), build:artifacts, check:cv/bundle/leaks/licenses/assets | **PASS** |
| e2e (thêm world-intro, world-journal) | **147/147 PASS** |
| test:perf | **PASS**: 3D tới playable 1,73 MB / 8 MB; thời gian tới playable tệ nhất 2,45 s / 10 s; Welcome JS 137,1 / 150 KB |
| Lighthouse | **PASS** |
| T08/T09 | **NOT RUN** |

Chưa push.

### Đợt 18–20 (2026-11-05): world có sự sống

Duy yêu cầu giao nhiều việc hơn cho Codex. 15 ticket, tối đa **12 worker song song**:
- Ticket nào không sửa `index.ts` thì chạy song song.
- 4 ticket sửa `index.ts` (dịch chuyển, xe, secrets/ending, mascot) chạy tuần tự.

Chi tiết: `docs/tickets/queue.md`.

**Đã có trong world:**
- **Nhân vật D-23 đã rig:** 19 xương; đứng, đi, chạy. Lead chạy Blender và sửa lỗi trọng số trong script. Kích thước 134 KB sau meshopt.
- **Biển chỉ đường và bàn** vẽ tay.
- **Nguồn suối** thon dần.
- **Cỏ và đá** theo từng ô đất.
- **Dịch chuyển** giữa 8 biển, có hộp chọn khu.
- **Xe GD110:** lên xe bằng E, lái tay, Auto Cruise bằng C.
- **4 secrets và ending 36 s.**
- **Mascot,** có nút tắt trong menu.
- **Nút Sound** bật âm môi trường tổng hợp bằng WebAudio, không dùng file âm thanh.

**Lead sửa khi tích hợp:**
- Trọng số rig bị ghi đè.
- Test cấm import audio, sửa để cho phép đúng ngoại lệ cầu nối.
- Màu cỏ chìm vào nền đất.
- **Khi pause, nhân vật vẫn thở và đồng hồ gợi ý mascot vẫn chạy.** E2E §6.1 và Q21 bắt được: 2 test fail. Đã sửa ở `abb6c2d`; tạm dừng giờ là đứng yên hoàn toàn.

**Gate A đầy đủ trên main `abb6c2d`** (máy dev RTX 3060, Edge headless):

| Kiểm tra | Kết quả |
|---|---|
| lint, typecheck, unit (773), build:artifacts, check:cv/bundle/leaks/licenses/assets | **PASS** |
| e2e | **151/151 PASS** |
| test:perf, tiêu chí: 3D tới playable | **PASS**: 1,92 MB / 8 MB |
| test:perf, tiêu chí: thời gian tới playable (tệ nhất) | **PASS**: 3,77 s / 10 s. Trước đợt này 2,45 s; tăng chủ yếu do tải nhân vật |
| test:perf, tiêu chí: Welcome JS | **PASS**: 137,4 / 150 KB |
| Lighthouse | **PASS** |
| T08/T09 | **NOT RUN** |

Ending chưa xem được bằng mắt trong world (phải tìm đủ secret); hiện chỉ unit test phủ.

**Sự cố CI (đợt 17 → 62ef088):** CI trên GitHub đỏ ở bước unit test từ lượt push đợt 17 (`91ed844`). Lead không kiểm kết quả CI sau lượt push đó, nên đỏ qua 3 lượt push.
- **Nguyên nhân:** Node 24.22 (runtime của CI) không gỡ được listener khi gọi `removeEventListener(type, fn, true)`. DOM giả trong unit test kế thừa `EventTarget` của Node, nên trình bắt phím của dialog cũ còn sót lại.
  - Tái hiện được trong Docker `node:24`.
  - Node 26 (máy dev) và trình duyệt thật không bị. Code sản phẩm không lỗi.
- **Lần sửa đầu sai:** `d1b0c85` dựa trên giả thuyết về thời gian; đã revert.
- **Sửa thật ở `62ef088`:** file setup Vitest chuẩn hóa tham số capture, kèm test hồi quy.
  - Trước khi push đã chạy trong Docker Node 24: unit 774/774 PASS, e2e Chromium 151/151 PASS.
  - **CI GitHub lượt chạy cho `62ef088`: PASS cả 2 job** (gồm unit, build, e2e, perf, Lighthouse, terraform validate).
- **Từ nay:** sau mỗi lần push, Lead đợi kết quả CI rồi mới báo cáo. Lỗi chỉ xảy ra trên CI thì tái hiện bằng `docker run node:24` trước khi sửa.

### Đợt 21–23 (2026-11-05): 8 khu hoàn chỉnh + UX/UI

Duy chỉ test khi map và UX/UI hoàn chỉnh. Đợt này làm 3 phần.

**Dựng 8 khu:**
- Hợp đồng chung `zones/types.ts`, mỗi khu là 1 ticket Codex.
- Địa hình dấu mốc: đồi Milestones, mỏm Horizon, thềm Workshop.
- Nối khu vào world (B2-100); mọi khu có vật để mở nội dung.

**Đánh bóng qua 3 vòng Art Director:**
- Vòng 2 bỏ dáng nghĩa trang ở Milestones và hình thánh giá ở Old Trail.
- Vòng 3 xem trong bối cảnh thật: thông Đà Lạt, rừng mọc thành cụm, dải sáng tối, Quiet Shore nhìn ra biển, bỏ vách răng cưa dưới Milestones.

**UX/UI:**
- Menu đủ mục theo §6.4.
- HUD có Sổ Atlas, gợi ý phím 10 s đầu, thẻ tên khu khi bước vào.
- Overlay tạp chí cho cả 8 khu: dữ liệu thật; 4 khu chờ Q-34…37.
- Thống nhất nhãn "Rời world".

**Lỗi UX thật mà gate A (e2e) bắt được:** vật nội dung cách đường 4,7 m nhưng phạm vi E chỉ 2,5 m, nên đi đúng đường không bao giờ thấy gợi ý. Sửa ở `4318b1f`: phạm vi E của vật trong khu là 6,5 m.

**Sự cố quy trình:**
- Codex hết lượt giữa đợt. Lead tự hoàn tất B2-100, sửa 4 ticket dở, rồi Duy đổi tài khoản.
- Gate cũ không bắt warning lint, nên 7 warning lọt vào main. Đã sửa; gate giờ dùng `--max-warnings=0`.
- Horizon vòng 2 và vòng 3 bị bỏ: một bản làm vỡ world, một bản kém hơn bằng mắt. Giữ Horizon vòng 1.

**Gate A đầy đủ trên `20109a4`:**

| Kiểm tra | Kết quả |
|---|---|
| lint (0 warning), typecheck, unit 1008, build, check:cv/bundle/leaks/licenses/assets | **PASS** |
| e2e | **151/151 PASS** |
| perf | **PASS**: 3D tới playable 1,94 MB / 8 MB; Welcome JS 137,5 / 150 KB |
| perf: thời gian tới playable | **4,96 s / 10 s**. Tăng từ 3,77 s; đang theo dõi |
| Lighthouse | **PASS** |
| T08/T09 | **NOT RUN** |

Showcase: `docs/showcase/23-eight-zones/checklist.md`. Chưa push.

### Đợt 24–26 (2026-11-05 → 06): hướng A "Tranh chân thật", ánh sáng bình minh/hoàng hôn, asset làm kỹ

Duy chọn hướng A (Q-44, ADR 0013 bổ sung) và yêu cầu rừng bình minh le lói, biển hoàng hôn (B2-180). Đợt 26 làm công đoạn 1–4 của B2.

**Đã xong:**
- Ánh sáng theo vị trí (B2-180); nước nhận ánh sáng grade (B2-181/181b); mây không lặp (B2-188/188b).
- Art bible khoá (B2-184): `docs/art-bible/` gồm palette, lighting, shading, asset-budgets, materials, character, gd110.
- Asset:
  - bộ đá (B2-186), bộ gỗ (B2-187);
  - lớp phủ nền (B2-185, re-land sau revert e13d9b1);
  - mặt đất (B2-190);
  - GD110 (B2-189), nhân vật (B2-192, GLB dựng lại 7 784 tam giác / 147 KB);
  - bỏ lưới cát bờ (B2-193);
  - 8 khu vòng 4 (B2-201…208).
- Bộ chụp T10 (B2-209).
- Lead kiểm bằng render (af97a54):
  - tán vòm 14 cụm có cành;
  - thân nâu xám;
  - lá trong bóng xanh lá thay vì navy/đen.
- Perf (896ea9e): Milestones dựng 1,47 s → 0,42 s.

**Gate trên `4b29f2b`:**

| Kiểm tra | Kết quả |
|---|---|
| lint (0 warning), typecheck, unit 1543 | **PASS** |
| e2e | **151/151 PASS** |
| perf: 3D tới playable | **PASS**, 1,99 MB / 8 MB |
| perf: thời gian tới playable | **5,90 s / 10 s PASS**; mục tiêu nội bộ ≤ 6 s **PASS** (B2-197) |
| T10 | **DEFERRED**: Duy chỉ chấm khi UX/UI hoàn thành khoảng 90–100 % (2026-11-06); hiện vẫn là khung. Bộ chụp 12 ảnh + phiếu đã sẵn |
| T08/T09 | **NOT RUN**: laptop Iris Xe của Duy (ADR 0007) |

**Sự cố quy trình:**
- Một lệnh `gate | tail` che mã lỗi, nên B2-185 vào main khi gate đỏ (9edfefd). Đã revert (e13d9b1), trả Codex làm B2-185b rồi merge lại. Từ nay lệnh commit chỉ chạy sau khi đã kiểm mã thoát của gate.
- Cả hai tài khoản Codex hết lượt (hồi lúc 8:27). Lead tự làm tiếp B2-181, B2-193, B2-201 (vòng import), B2-205 và lần render cây.
- Gate chạy song song 12 worker thì unit timeout. Gate của Lead giờ dùng `--maxWorkers=4 --testTimeout=60000` và chạy lại một lần nếu chỉ có timeout; không đổi assertion nào.

Showcase: `docs/showcase/26-asset-ky/checklist.md`. Chưa push.

### Đợt 27 (2026-11-06): công đoạn 5 + hoàn thiện lượt 1–2

- Duy: chỉ chấm khi UX/UI ≈ 90–100 % → T10 **DEFERRED**.
- **Công đoạn 5 (hành trình):**
  - bot đi bộ thật (B2-210) **PASS**: 6:08, Workshop 47,7 s, Roots 66 s, Milestones 83 s, 0 lần kẹt (`docs/evidence/B2/journey-2026-11-06.md`);
  - audit định hướng (B2-211) + mốc (B2-212): đoạn mù dài nhất 115 m → 60 m;
  - playtest người thật DEFERRED (`docs/playtest/b2-journey.md`).
- **Hoàn thiện (đợt 27):**
  - mép lá (B2-213), kim thông (B2-218);
  - đồng cỏ quanh người chơi (B2-214, Lead chỉnh sau render);
  - mặt đất chi tiết (B2-215);
  - prop đọc rõ (B2-216, Lead sửa xanh lam/trắng);
  - gợn và bọt nước (B2-219);
  - First Light/Roots r6 (B2-220).
- **Perf:** B2-217 dựng lớp phủ nền ngoài vòng spawn sau khung hình đầu → thời gian vào chơi **4,89 s** (trước 6,05–6,13 s). Dựng nền xong ~6 s sau khi điều khiển; tín hiệu `data-world-build="done"`.
- **Codex:** chạy `gpt-6.1-sol` mức `low` (Duy chọn). Lead tự hoàn tất ticket dở khi tài khoản hết lượt.
- **e2e:** timeout mặc định 90 s cho khớp với `enterWorld`; spec journal bấm J tới khi mở; test so khung hình chờ `data-world-build`.

| Kiểm tra (trên `5994771`) | Kết quả |
|---|---|
| lint, typecheck, unit 1576 | **PASS** |
| e2e | **151/151 PASS** |
| perf: thời gian tới playable | **4,89 s** (spec 10 s, mục tiêu nội bộ 6 s): **PASS** |
| perf: 3D bytes | **PASS**, 2,00 MB / 8 MB |
| hành trình 5–7 phút | **PASS**, 6:08 (desktop tham khảo) |
| T10, playtest người thật | **DEFERRED** (chờ UX/UI ≈ 90–100 %) |
| T08/T09 | **NOT RUN** (laptop Iris Xe) |

### Đợt 27 tiếp (2026-11-06 tối): duyệt bằng ảnh trong game

- Công cụ: hook QA `goTo(zone)` + `tools/review/ingame-shots.mjs` (B2-226). Lead duyệt bằng ảnh **trong game thật** ở 8 khu (`docs/showcase/27-hoan-thien-1/ingame/`), không chỉ ảnh tour.
- Đã merge:
  - lớp phủ dày quanh spawn (B2-223) + lớp phủ mềm được mọc trên nền khu (B2-225);
  - nền rừng sáng hơn, đốm nắng (B2-224);
  - First Light trong khung nhìn đầu (B2-222), Milestones thấy từ điểm đến (B2-228);
  - suối rừng có màu nước (B2-221);
  - gợn nước không hoa văn lặp (B2-219b → 219c sau 2 vòng);
  - biển hoàng hôn xanh tím, hết nan quạt (B2-229 → 229b).
- Tín hiệu `data-world-build`; timeout e2e 90 s; vài spec ổn định hơn dưới tải.

| Kiểm tra (trên `d7a6f66`) | Kết quả |
|---|---|
| lint, typecheck, unit 1605 | **PASS** |
| e2e | **151/151 PASS** |
| perf: thời gian tới playable | **5,22 s** (mục tiêu 6 s) **PASS** |
| perf: 3D bytes | **PASS**, 2,00 MB / 8 MB |

### Đợt 28 (2026-11-07): UX/UI hoàn thiện lượt 1

- B2-230 hệ UI trong world (menu, Sổ Atlas, "Đi tới…", focus yên tĩnh); B2-232 overlay tạp chí; B2-231 Welcome trên nền render hoàng hôn ven biển (thẻ giữ góc dưới trái theo ADR 0009); B2-233 Quick Portfolio kiểu tạp chí.
- Lead: sửa tiêu đề overlay lặp, nút đóng; cắt ảnh mobile; bỏ email trùng ở đầu Quick; cập nhật e2e cho radio chất lượng.
- Gate: unit 1612 **PASS**, e2e 151/151 **PASS**, Lighthouse **PASS**, Welcome JS 135 KB. Showcase: `docs/showcase/28-ux/checklist.md`.

### Đợt 29 (2026-11-07): cảnh mở đầu + cảnh kết theo hướng A

- B2-234: cảnh mở đầu bỏ "giấy kem + dải suối" (di sản hướng C); bay bình minh từ ~115 m dọc suối chữ S, có trời/mây, thanh letterbox màu mực. Lead trả 2 vòng (test cũ; trời kem, lộ mép tile, khung 10 s).
- B2-235: trời đúng từ khung đầu, lướt 36 m (không còn LOD thô); cảnh kết giữ hoàng hôn theo camera, khung bưu thiếp nhìn mặt trời thấp trên biển; thẻ thơ, gợi ý phím, dock HUD ẩn trong cinematic.
- Lead: hook QA `__tqaJourney.visitSecret(id)` + `tools/review/ending-shots.mjs` (lần đầu chụp được trọn ending 36 s); e2e helper chấp nhận HUD ẩn khi intro chạy.
- Còn lại nhỏ: mảng đất xanh đậm hình tam giác ở góc dưới khung ending 26–34 s; dải sương xanh nhạt ở chân trời intro.
- Ảnh: `docs/showcase/28-ux/hien-trang/` (intro cũ, ending-sheet), `docs/showcase/28-ux/lead-review/b2-234-*`, `b2-235-*-sheet.webp`.

| Kiểm tra (trên `c0c2ba0`) | Kết quả |
|---|---|
| lint, typecheck, unit 1623 | **PASS** |
| e2e | **151/151 PASS** |
| perf: thời gian tới playable | **5,18 s** (xấu nhất 3 lần; mục tiêu 6 s, spec 10 s) **PASS** |
| perf: 3D bytes / Welcome JS | **PASS**, 1,86 MB / 8 MB; 137,5 KB / 150 KB |
| Lighthouse (3 URL × 5) | **PASS** |
| T10, playtest người thật | **DEFERRED** (chờ UX/UI ~90–100 %) |
| T08/T09 Iris Xe | **NOT RUN** |

### Đợt 34 (2026-11-09): R1 toàn world

- **R1-A** rừng (`db39bed`), **R1-B** đồi (`e755681`), **R1-C** biển (`3c91eec`; Lead dựng sẵn bản merge vì sandbox Codex không ghi được `.git`, Codex giải xung đột). Cơ chế R1 chuyển từ "vùng 48 m" thành cấu hình theo biome, chuyển tiếp 40 m; camera chơi thấp 18° toàn world.
- Showcase + checklist: `docs/showcase/34-r1-toan-world/`.

| Kiểm tra (trên `3c91eec`) | Kết quả |
|---|---|
| lint, typecheck, unit 1733 | **PASS** |
| e2e | **153/153 PASS** |
| perf: tới playable EN/VI | **4,45 s / 4,41 s PASS** |
| perf: 3D bytes | **PASS**, 2,03 MB / 8 MB |
| Lighthouse | **PASS** |
| T10, playtest, Iris Xe | **DEFERRED / NOT RUN** |

### Đợt 32–33 (2026-11-09): First Light R1 + nguồn suối + lan can (Claude-Lead)

- Duy giữ hướng **R1** (First Light). **FL-02**: nguồn suối là cụm 7 tảng đá rêu, thác nhỏ có bọt, vũng trũng viền đá; sửa mảng tối intro 10 s. R1 + FL-02 merge `f7f8c27`.
- **RD-01** (`6740901`): đường đủ rộng tới cuối, lan can chắn; E "Ngắm biển" → nhân vật tựa hai tay nhìn mặt trời, camera thấp sau lưng, HUD ẩn; lan can dọc đường biển; e2e `world-railing.spec.ts`.
- Lead: `_common-b2.md` cho phép sửa index.ts/e2e khi ticket ghi rõ và cho Codex tự mở Edge kiểm tra; sửa `autoresume.sh`; e2e local tối đa 4 worker (8 worker SwiftShader làm Enter World quá thời gian).

| Kiểm tra (trên `f7f8c27`) | Kết quả |
|---|---|
| lint, typecheck, unit 1723 | **PASS** |
| e2e | **153/153 PASS** (4 worker) |
| perf: tới playable (EN/VI, xấu nhất 3 lần) | **5,34 s / 5,49 s PASS** (nội bộ 6 s) |
| perf: 3D bytes | **PASS**, 2,03 MB / 8 MB |
| Lighthouse | **PASS** |
| Duyệt gu R1 nhân rộng 7 khu, T10, playtest | **DEFERRED** |
| T08/T09 Iris Xe | **NOT RUN** |

### Đợt 30 (2026-11-07/08): mở đợt đồ họa (ADR 0014) + ưu tiên UX/UI

- Merge: B2-241 tán rừng xa (intro đọc là rừng), B2-242 bờ đá ấm Quiet Shore, B2-243 sông chỉ nhường biển ở cửa sông thật (giữ suối Horizon), B2-244 hoàng hôn trên biển lúc chơi + sông ven biển đọc được.
- ADR 0014: cho phép GLB Blender + texture KTX2 tự sinh. Mẫu vòng duyệt gu đã merge (bản mẫu, Duy duyệt gu sau): **G-01** texture đất (5 KTX2, 385 KB; Lead sửa lỗi shader), **G-02** 6 cây Blender, **G-04** AO màn hình + bóng mềm. **G-03** đá/prop: trả lại (mặt đất chuyển trắng).
- UX/UI ưu tiên (Duy 2026-11-08): **U-01** thang chữ UI world + Quick, **U-02** overlay khu hướng A (ảnh render từng khu), **U-03** nút Enter World + hero mới (chờ U-01).
- Lead: `tools/lead/autoresume.sh` (tự chạy lại khi Codex hồi lượt, sửa lỗi vòng chờ cũ làm dừng 3 giờ), `tools/review/{assets-loaded,intro-shots,ux-shots}.mjs`, `TQA_QUALITY=high` cho `ingame-shots`. Runbook Codex-Lead: `docs/runbook/codex-lead.md` (Claude ≥ 95 % tuần → Codex làm Lead).
- Kiểm tra trên `500e178`: lint/typecheck/unit 1676 **PASS**; e2e/perf/Lighthouse đợt này **NOT RUN** (chạy sau khi merge U-xx).

### Đợt 29b (2026-11-07): đi xe, camera, ánh sáng lúc chơi, cửa sông

- B2-236 (Codex, 2 vòng): chân trời intro mượt (`setFogColorOverride`), cảnh bưu thiếp hết mảng tối (mặt nạ cửa sông chỉ trong ending).
- B2-237 (Codex + Lead nối): người lái ngồi trên xe bằng rig sẵn có; xuống xe tìm chỗ an toàn hai bên, báo lý do vi/en.
- B2-238 (**Lead tự làm**): bản Codex tốn CPU (+45 ms/s ở First Light) và gây màn hình đen sau ending → bỏ; Lead sửa tối thiểu: camera xe 0,75× arm, thấp hơn 7,5°; bỏ va chạm < 0,35 m quanh nhân vật (hết khối đen ở bí mật reflection).
- B2-239 (Codex, 2 vòng): luma lúc chơi theo art bible (rừng 0,19 → 0,24–0,26 giữ xanh rêu; Horizon 0,16 → 0,32 do sửa ánh xạ tod).
- B2-240 (Codex hết lượt giữa chừng, Lead hoàn tất): hết "bóng đất giả" ở biển Last Postcard. Phần cắt dải sông làm **mất suối ở Horizon** → Lead hoàn lại phần đó, giữ mặt nạ ending.
- Lead: tán xa pha màu rêu (hết khối vuông tối trong intro sau B2-239); hook QA `nearVehicle`, `visitSecret`; công cụ `tools/review/{ending-shots,extras-shots,luma,ground-hue,cpu-compare,frame-compare}.mjs`.
- Codex: tài khoản hiện tại hết lượt tuần (tới 12/11 16:23). Chờ Duy đổi tài khoản.

| Kiểm tra (trên `5e2c61c`) | Kết quả |
|---|---|
| lint, typecheck, unit 1642 | **PASS** |
| e2e | **151/151 PASS** |
| perf: thời gian tới playable | **5,16 s** (xấu nhất 3 lần) **PASS** |
| perf: 3D bytes | **PASS**, 2,00 MB / 8 MB |
| Lighthouse | **PASS** |
| T10, playtest người thật | **DEFERRED** (chờ UX/UI ~90–100 %) |
| T08/T09 Iris Xe | **NOT RUN** |

Showcase: `docs/showcase/29-hoan-thien/checklist.md`.

Việc tiếp theo đề xuất: (1) intro nhìn từ trên cao rừng thưa như đồng cỏ: cần tán xa dạng cây/impostor; (2) dải tối dọc vách ở Quiet Shore; (3) biển Last Postcard lúc chơi còn tối (luma 0,21); (4) cửa sông đè biển lúc chơi (sửa gốc đúng cách, theo độ cao địa hình thay vì trục z).

### Ticket tiếp theo

1. Vòng sửa thứ hai đã xong (B2-181c, 188c, 191b, 194, 195, 196, 197, 204b, 208b). Còn B2-198: cây vòm có cành lớn thật để tán khép trên lối.
2. Duy + 1 người ngoài chấm T10 (12 ảnh, ≥ 10/12).
3. B2-034: T08/T09 trên Iris Xe (Duy).

### Ticket tiếp theo (đợt 21–23)

1. ~~B2-151~~ đã xong (`86e4a66`): vệt nắng First Light trong suốt, mép suối ven biển mượt (kiểm bằng tour).
2. Nhập nội dung khi Duy trả lời Q-34…37.
3. B2-034: đo T08/T09 trên Iris Xe.
4. Theo dõi thời gian tới playable (4,96 s).

### Ticket tiếp theo (cũ, trước đợt 14 — giữ để tra)

- Duy: duyệt từng trang (Q-04) — Lead gửi link xem thử local; còn Q-16 (AWS pipeline), Q-10 (mã CPU laptop).
- L3 (B2, sau A2): chọn nhạc CC0/giấy phép rõ ràng theo art direction (Q-11).
- L5: tflint + Checkov/Trivy (ghim phiên bản/SHA) trước A2 apply.
- L1: hoãn probe WebGL trên desktop tới lúc rảnh.
- Lead: dư địa TBT ở CPU chậm nằm ở runtime Next/React — cân nhắc cấu hình Next (ADR mới) nếu CI chập chờn lại.
- Quy trình: việc cần mở trình duyệt để đo (Lighthouse/trace) giao subagent, không giao Codex (sandbox chặn Edge).
- L3/L4: chạy lại T09 có người giữ cửa sổ Edge; nếu vẫn tụt 1 Hz thì điều tra (visibility, efficiency mode).
- Chữ world tiếng Việt chưa được duyệt biên tập.
- L2-008: Atlas Journal (J) §7.2 — chỉ cần sau khi có thêm khu; nay thuộc B2 local (ADR 0012).
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

### Đợt 24 (2026-11-05): nội dung 4 khu, thơ secrets, tên miền, cảnh biển hoàng hôn

- **Nội dung thật** (Q-34…37): The Roots (kỹ năng theo mức đã làm/đã học), The Milestones (VTI DevOps 09/2026 + 2 dự định), The Horizon (định hướng tính từ tốt nghiệp 06/2027), The Quiet Shore (sở thích, tính cách). Không còn trang "Duy đang viết". Commit `0eaf777`.
- **Điện thoại** hiện ở Last Postcard (Duy chọn hiện cả web).
- **Thơ secrets** (Q-32): thẻ thơ 4 câu, tiếng Anh trước, nút "Tiếng Việt / Bản tiếng Anh"; hiện 14 s, giữ lâu hơn khi rê chuột/focus nút. Bản dịch chờ duyệt (Q-39).
- **Tên miền** `nhbduy.id.vn` (Q-09): `SITE_URL` mặc định của build; canonical, sitemap, robots dùng tên miền. Hosted zone/ACM để tới A2.
- **AWS credit** (Q-08): 100 USD, hạn 2027-05-05. Spec giả định 200 USD; kế hoạch A2 tính theo 100 USD.
- Sửa test `teleport-loading` (fail cố định khi chạy riêng lẻ do import lạnh).
- Gate local: lint 0 warning, typecheck, unit 1043/1043: **PASS** (máy dev, trước khi merge đợt Codex).
- **Codex đang làm (đợt 24):** B2-152 địa hình (núi trái, vịnh cong phải), B2-153 rừng dày bên núi, B2-154 biển phản chiếu hoàng hôn + sóng nhẹ, B2-155 grade hoàng hôn + sương núi, B2-156 Quiet Shore (piano, chó nằm ngủ).
