# RC-01 — bàn giao RC đã kiểm (2026-11-10)

**Nguồn RC:** `bbd85a7c336aa025f11f42d40a07ea8bdbea83f1`, clone `D:/tqa-worktrees/RC-01`, nhánh `lane/RC-01`. [Showcase, ảnh và video](../showcase/35-rc/README.md) · [Audit/log](../showcase/35-rc/audit.md) · [Duy chạy và chấm](../playtest/rc-guide.md).

- Build, lint 0 warning, typecheck, **1759/1759 unit PASS**; full e2e **153/153 PASS**, 4 worker, exit 0. Các phép kiểm đều trên nguồn RC này.
- Load-budget VI/EN, 3 tải lạnh mỗi locale: worst **4653,10 ms**, world **2.128.915 B**; kiểm riêng mốc RC 6000 ms/8 MiB PASS. Lighthouse **15/15** report, profile mobile/simulate slow 4G/CPU 4× gốc được kiểm trong từng report, assertions gốc PASS; worst LCP 2350,23 ms/TBT 49 ms/CLS 0,018288, accessibility 100. CV, bundle, license và asset PASS.
- CPU harness gốc Balanced/1500 ms warm-up/W 4 s, ABBA hai lượt mỗi bản: delta Script/Task First Light **+3,5/+5**, Roots **−15/−17**, Workshop **−11/−12 ms/s**: PASS trần +10. Baseline export `144a02c` có world source giống main `3bb0752`, git diff đã kiểm. Giữ mọi FAIL cũ; diagnostic 15 s không dùng thay gate.
- Lead đã mở từng ảnh đủ 8 khu High và 15 ảnh intro/ending; Art/QA mở 12 Welcome/Quick VI/EN desktop/mobile cuối. Max luma delta 0,001. Slideshow ảnh QA **45,00 s**, 1280×720, WebM; đã decode/seek/xem khung, không gọi là video gameplay. Chạy tuyến phím thật và UI140 đã có từ lượt trước, không làm lại.
- T08/T09 Iris Xe **NOT RUN**; T10/điểm người chơi **DEFERRED** cho Duy. P3 còn lại và giới hạn kiểm mẫu ghi trong audit; bảng chấm vẫn trống.
- Main HEAD `d00bf20` (chỉ thêm tài liệu, runtime như `3bb0752`), `.git` chỉ đọc, **chưa merge/push**. Theo chỉ dẫn Claude-Lead 10/11 06:50: Codex được chốt DONE bằng hash trong clone sau đủ gate; Claude-Lead `git fetch D:/tqa-worktrees/RC-01 lane/RC-01`, duyệt/merge main. Không cần Codex tự merge trong môi trường này.
- Bằng chứng/tài liệu được commit sau nguồn RC, **không đổi runtime/assets/dependency**. Các checkpoint “đang làm” bên dưới là lịch sử đã xử lý; không khởi động lại ticket/đo đã hoàn tất.

Lỗi môi trường đã xử lý: e2e lần đầu đủ 153 ok nhưng treo teardown server Windows; chạy lại dùng server ngoài exit 0. Lighthouse lần launcher đầu không fetch được CDP, taskkill cũng bị từ chối; chạy lại bằng Edge do Playwright quản lý, attach CDP loopback 9333, giữ nguyên profile/15 runs/assertions. Giữ log FAIL/BLOCKED gốc trong showcase.


# Bàn giao UX/UI — 2026-11-08 (lịch sử)

**Duy yêu cầu bàn giao lại cho Claude.** Bản tiếp nhận đầy đủ: [claude-handoff-2026-11-08.md](claude-handoff-2026-11-08.md). Codex đã chuẩn bị tài liệu, chờ Duy gọi Claude tiếp nhận; chưa xác nhận Claude đã đọc. Không còn lịch heartbeat tự chạy.

## Chỉ dẫn mới nhất: mẫu một khu, chờ Duy duyệt

Duy không nghiệm thu hình ảnh đợt 31 và yêu cầu làm lại First Light trước. FL-01 đã ở trạng thái **review** trên `lane/FirstLight-R1`, source `56d29d5`, docs `720e48e`, worktree `D:/tqa-worktrees/FirstLight-R1`. Gallery: `docs/showcase/32-first-light-prototype/README.md`. Mã mẫu chưa merge main; chỉ sao chép ảnh/báo cáo để duyệt. Không tự mở rộng worker hoặc sửa tiếp gu khi chưa có phản hồi Duy. CPU của mẫu vẫn chưa được ghi PASS (giữ kết quả ban đầu và cặp xác nhận trong báo cáo); cần giải quyết trước sản xuất hàng loạt.

Duy giao Codex nhận UX/UI còn lại và báo cáo gộp cuối đợt. Ban đầu chạy subagent tuần tự; cập nhật tiếp theo yêu cầu khoảng 5 tác nhân mỗi đợt. Hệ thống hiện cho tối đa 3 subagent đồng thời với root, nên chia 5 vai và xếp theo giới hạn này. Các phép đo GPU/e2e/perf vẫn chạy riêng để tránh nhiễu. Ủy quyền này áp dụng cho đợt UX/UI; không cần chờ ngưỡng usage 95% để thực hiện các ticket này.

## Trình tự thực hiện

1. U-02: hoàn thiện ảnh bưu thiếp 8 khu, overlay tạp chí, kiểm tra mobile và nút Đóng. Đã tích hợp trong `b961662`.
2. U-03: Welcome, CTA, ảnh biển mới và reflow. Đã tích hợp trong `a8900c2`.
3. QA: chạy gate, full e2e, load-budget, Lighthouse và rà các bảng Menu/Sổ Atlas/Đi tới…/Quick trên bản tích hợp.

Các hash `b961662`/`a8900c2` và worktree `UX-final` ở trên là lịch sử tích hợp, không phải worktree đang chạy. Đợt UI đã squash-merge vào main `f20147d`; sửa pause và locator tiếp tục merge tại `7774ae8`. Hai worktree tích hợp đã được gỡ sau gate. Không khởi động lại worker cũ U-02/U-03.

Năm vai kiểm tra cuối đã hoàn tất: tài nguyên/markup, full e2e, đối chiếu báo cáo, load-budget, Lighthouse. Tài nguyên và báo cáo chỉ đọc chạy cùng lúc; ba phép kiểm trình duyệt nặng chạy lần lượt. Main `7774ae8`: strict gate 1697/1697 unit, full e2e 151/151, 3 tải lạnh mỗi locale EN/VI và 15 lượt Lighthouse đều PASS. Không khởi động lại phép kiểm hoặc ticket đã hoàn tất khi không có thay đổi mới.

Kết quả cuối và bằng chứng: `docs/showcase/31-ux-final/checklist.md` và cập nhật mới nhất ở `docs/PROJECT_STATUS.md`.

Giữ nguyên: không push nếu chưa được Duy đồng ý từng lần; không chạm cloud/credential; không ghi PASS khi chưa chạy. T10/playtest do người thật và T08/T09 trên Iris Xe chưa được thay thế bằng QA trên máy dev.

## Cập nhật Claude-Lead 2026-11-09 ~03:30 (main `6af4eda`)

- Duy chọn **giữ hướng R1** cho First Light, kèm 2 yêu cầu:
  - (1) nguồn suối có núi đá → **FL-02**, đang ở vòng 2 trên `lane/FirstLight-R1`. Phiếu trả lại: `docs/tickets/FL-02-spring-source.md`, gồm đá tự nhiên, vũng trũng có viền, thác nhỏ, sửa mảng tam giác tối ở intro 10 s, thời gian vào chơi ≤ 6 s.
  - (2) lan can cuối đường + tựa lan can ngắm biển + lan can dọc đường biển → **RD-01 đã merge** (`6740901`, e2e `world-railing.spec.ts`).
- Khi FL-02 đạt: merge `lane/FirstLight-R1` (R1 + FL-02) vào main bằng `tools/lead/merge.sh FirstLight-R1 <msg>`. Sau đó chạy full e2e, `load-budget` (khi máy rảnh) và Lighthouse; nhân rộng ngôn ngữ R1 ra 7 khu còn lại theo từng ticket.
- `_common-b2.md` đã nới: ticket nào ghi rõ `index.ts` hay `tests/e2e/` thì được sửa; Codex được mở Edge để tự kiểm tra hình.
- `tools/lead/autoresume.sh` đã sửa lỗi hiểu giờ reset đã qua thành hôm nay.
- Thời gian vào chơi: các lần đo khi máy bận cho ra 6,2–6,9 s. **Cần đo lại khi máy rảnh**; spec 10 s vẫn PASS.

## Nhân rộng R1 (Duy 2026-11-09: "Nhân rộng R1")

Theo `docs/tickets/R1-rollout.md`: **R1-A** (rừng, tổng quát hoá cơ chế R1 từ vùng 48 m thành cấu hình theo biome) → merge → **R1-B** (đồi) và **R1-C** (biển) **chạy song song** (mỗi ticket chỉ sửa preset biome và dressing khu của mình; file dùng chung chỉ Lead sửa khi merge). Lead duyệt từng bước bằng ảnh High đủ 8 khu, intro, ending; chạy `cpu-compare` và `load-budget`. Sau R1-C: full e2e (4 worker), Lighthouse, showcase `docs/showcase/34-r1-toan-world/` + checklist để Duy chấm.

## RC-01 (Duy 2026-11-09): Codex hoàn thiện bản RC để Duy test thật

Ngưỡng Claude nâng lên **97 %** tuần. Codex chạy như Lead theo `docs/tickets/RC-01-release-candidate.md`, được khởi động bằng `bash tools/lead/run-codex-lead.sh RC-01-release-candidate.md`. Script tự chạy lại sau giờ reset và dừng khi file này có dòng `RC-01 DONE <hash>`.

### RC-01 đang làm

#### Lần 3 — tiếp tục 2026-11-10, nguồn `4d627b1`

##### Checkpoint mới nhất lần3 — ứng viên `bbd85a7`

- RC21 `ccd9145`: bỏ Vector3 tạm và sửa sparse filter, gate1755PASS; CPU vẫnFAIL, giữ log. RC22 `bbd85a7c336aa025f11f42d40a07ea8bdbea83f1`: cache world-sphere mặc định trước raycast; targeted26/26PASS, buildPASS, strictgate1759/1759PASS. Không còn runtime/test/tools/public diff ngoài commit.
- **CPU bbd PASS** bằng harness gốc không đổi: ABBA2mỗi bản Balanced1500mswarm/4sW; deltaScript/Task FL+3,5/+5, Roots−15/−17, Workshop−11/−12ms/s. Đã kiểm worldsource baselineexport144a02c giốngmain3bb0752 bằng gitdiff; `perf/cpu-final-summary.json` và4logbbd giữ đủ. CácFAILtrước không sửa hồi tố; diagnostic15s không dùng thaygate.
- Fullchain đang chạy session17459: gate đãPASS → High8after-bbd85a7 → visual-bbd85a7 introfull/endingHigh → e2e4worker reuse4185 → loadbudget gzip4174 → Lighthouseexternal4175 → checkCV. Đọc coverage/rc-*-bbd85a7.log trước khi chạy lại. LH log riêng có tên rc-lhci-bbd85a7.log. Runtime đã build, server4185 đọc out mới.
- Renderccd15ảnhHigh0errors đãxong: visual-ccd9145/results.json; rootmở introafter/ending00500/26000/after, khôngwedge/xuyênghế, HUDsạch. Sauchain phải mở đủ8Highbbd vàảnhintro/endingbbd, luma+groundhue; đọc loadJSON6coldruns đểkiểm trầnRC6000ms riêng (CLIchỉgate10000ms).
- Chưa DONE. Còn loggatescuối/bằngchứng, audit/checklist/status/guide/handoff đồngbộ và commitshowcase. Không push; main.git chỉđọc, ClaudeLead fetch/duyệt/merge theo ngoạilệ06:50.

- Không làm lại UI140 và journey. Clone `D:/tqa-worktrees/RC-01`, nguồn `4d627b1c3831a6b6b86545cdda499a545524a677`. Build và strict gate của nguồn này đã có log tại showcase35/checks: 1753/1753 unit PASS. Bundle/license/assets PASS trong lần3.
- Lead đã mở đủ8 ảnh `after/`, luma so `before/` max0,001; ground hue giữ nguyên trừ LastPostcard61→62. Đã mở4 ảnh intro-final1500/4000/7000/10000, ending-source-final00500/04000/14000/26000/after và hint-finalVI1600/EN1366. Ending hết wedge rõ và actor ngoài ghế; ảnh after ending có HUD cũ, hint-final4case trên4d xác nhận sửa RC20.
- Full e2e4worker có153/153 dòngok nhưng treo teardown server Windows, CHƯA ghi suitePASS. Giữ coverage/rc-e2e-4d627b1.log. Đã dừng chính runner44108/server40936 của lượt này. Chạy lại với E2E_PORT4185, dùng server ngoài có sẵn để tránh Playwright taskkill. Không thay assertion hay bỏ test.
- CPU ABBA lần3 chuẩn ở perf/cpu-run3-*.txt: còn FAIL, đặc biệt Roots (189/197 baseline,244/244 RC Script ms/s). Diagnostic ABBA15s warmup đang chạy session57861, ghi FPS/CPUframe để tìm nguyên nhân; không đổi trầnms/s. Browser/perf phải chạy lần lượt.
- Server candidate4185 session55541, baseline4186 session41381. Chưa full e2e exit0/load/LHCI cuối. Agent cpu_review chỉ cập nhật audit/checklist/README; root giữ STATUS/handoff. Chưa commit bằng chứng, không push.
- Chỉ dẫn Claude-Lead mới nhất trong handoff main (10/11 06:50): sau khi clone đủ gate, được ghi DONE hashclone để Claude fetch/review/merge main; không bắt buộc Codex tự merge khi .gitmain chỉđọc. CPU phải ≤main+10ms/s hoặc ghi rõ sốđo/lýdo chờ Duy, không tự miễn gate.

- Lần 1, 2026-11-09: base main 3bb0752. KHÔNG làm lại RC-02 capture và lượt journey đã hoàn thành.
- Môi trường từ chối ghi .git repo chính (git worktree add lỗi RC-01.lock Permission denied). Đã tạo clone độc lập D:/tqa-worktrees/RC-01, lane/RC-01, không phải worktree được đăng ký. Code/asset/bằng chứng ở clone; chưa merge main, chưa push.
- Dependency: pnpm offline bị chặn khóa store ngoài workspace; đã sao chép node_modules vật lý từ main vào clone, không đổi dependency/lockfile. Dùng pnpm.cmd --config.verifyDepsBeforeRun=false <script> hoặc Node CLI trực tiếp. Build Turbopack chuẩn đã chạy được.
- Đã làm: RC-02 chụp 8 postcards High + 3 hero ứng viên, chọn hero-0; license cập nhật, Lead đã xem ảnh. 8 ảnh High trước tại docs/showcase/35-rc/before. RC-03 sửa harness T08/T09 radio+RAM; RC-04 tạo script audit. RC-06 sửa build Next→CV→OG và checker fetch PDF thật.
- Journey Edge W+camera thật: PASS tuyến 367,91s, 1098,12m, 0 kẹt; đủ 8 khu, không teleport/Shift. Bằng chứng clone docs/showcase/35-rc/journey. Viewport hiện test 1366x800; audit UI 1600x900 đang chạy.
- Đang chạy: RC04 audit VI/EN và gate. Cần đọc ui-audit/results.json + steps.md, sửa lỗi thật hoặc script sai, kiểm camera thấp/intro/ending, High after+luma, chốt commit nguồn rồi full e2e4workers/load≤6s/8MB/LHCI/unit/checkCV trên hash đó.
- Hướng dẫn Duy đã có clone docs/playtest/rc-guide.md. Audit/checklist/status chưa hoàn chỉnh. T08/T09 Iris Xe NOT RUN, Duy chấm/T10 DEFERRED. Không ghi RC-01 DONE khi chưa merge/gate đủ.

#### Cập nhật lần 1 lúc 23:04 — ĐỌC MỤC NÀY TRƯỚC

- Clone nguồn hiện commit 522b6dd (sau 144a02c → 77700fc → d761a62). Main vẫn 3bb0752, .git read-only, KHÔNG MERGE/PUSH.
- RC02 ảnh mới hoàn tất; RC03 harness; RC06 build đủ CV/OG; RC07 ẩn placeholder giữ qualification; RC08 CV2trang VI/EN đã mở xem4trang; RC09 camera loại biển mảnh khỏi ray camera (không đổi collision/LoS), thêm cameraDistance scalar QA; RC10 skip alpha upload khi Float32 không đổi; RC11 cache inverse crown đúng invalidation. Commit522 đã có RC11 nhưng CHƯA BUILD/ĐO nó.
- AuditUI lượt2 trên export d761a62: PASS, 140/140 bước; đủ VI/EN desktop1600x900, mobile390/320, introfull+skipthật, overlay8khu E thật, menu/xe/secrets/ending/lan can, CV PDF HTTP+signature, 8 casepages. Kết quả docs/showcase/35-rc/ui-audit; lượt1 FAIL harness giữ ui-audit-first.
- Camera64ảnh trước/sau: camera-before/camera-after (sau source777); đã mở đủ8contact sau, không còn phóng sát thân. Một số góc nhìn biển chỉđường đứng trước người che một phần torso, không phải camera chui vào người. Hình cây R1 trong mẫu không che kín actor. Luma High8 after còn CHƯA CHẠY.
- CPU2lượt mỗi bản: baseline144(world nhưmain3bb) Workshop246/267 Script/Task ms/s; camera777 tăng lên297/321.5 FAIL; RC10d761 mean277/298.5 vẫn FAIL+31. Giữ đủ6log trong showcase35/perf. RC11 cache chưa đo, không ghi PASS. Cần build522+mọi sửa mới rồi2lượt CPU cô lập.
- Đã thấy lỗi ảnh ending: (a) actor xuyên ghế do hook visitSecret đặt tâmghế — root đang sửa RC13 index.ts+intro-wiring.test.ts, đứngx+1.8 ngoài bench, 17unit intro PASS; sourceCHƯACOMMIT. (b) mảng tamgiác biển do seaquad800m không phủ frustum endingfar2000 (suy luận cần render xác nhận). Agent rc_static_review đang sửa RC12sea.ts+tests+ticket để geometry rộng6000 nhưngshoreline109sample vẫn800, chưa review/commit/render.
- Gate sau144 FAIL 1expectEvidenceTBD→đãsửa777. Gate d761 FAIL lint vì .tmp/baseline-out chứacompiledJS→đãchuyển coverage/rc-baseline-out (ignored), lint full sau đó exit0. Gate522 FAIL 1whitelistQA cameraDistance→rootđãsửa intro-wiring,test17PASS. Chưa có strictgate cuối. Đây là FAIL thật được giữ, không đổi hồi tố.
- Bước tiếp: review RC12; commitRC12/RC13 + runbook t08-iris-xe mới; buildsourcecuối; CPU2/camera ảnhending đốichiếu; fullgate, full e2e4worker, load-budget≤6s/8MB, LHCI trênsourcehashcuối; 8Highafter+luma; cậpnhật audit/checklist/PROJECT_STATUS, commitbằngchứng. Không ghi DONE vì chưa đủ và chưamerge. Guide đã có.

#### Lần 2 — checkpoint 2026-11-10

- Tiếp tục đúng clone `D:/tqa-worktrees/RC-01`, không làm lại 140 bước audit hoặc journey đã xong. Main vẫn `3bb0752`; `.git` repo chính chỉ đọc, chưa merge/push.
- Nguồn đã có RC12 `c5a16f9`, RC13 `b0b1fa8`, RC15 broadphase tán `09b30e0`. RC16 bounding box collider tĩnh đang tích hợp; 6 unit camera và 24 unit foliage đã chạy ở worker, chưa thay strict gate cuối.
- Đã đo lại CPU ABBA sau RC11: First Light baseline trung bình Script/Task 225,5/247 ms/s, RC11 279,5/304: FAIL. Roots và Workshop không tăng trên cặp này. Giữ log `perf/cpu-confirm-*.txt`; RC15/16 chưa đo. Không ghi CPU PASS.
- RC12 mở rộng quad không đủ sửa tam giác biển. Đã cô lập vào shader shoreline (constant offshore loại dải), đang thử sửa có bằng chứng trước/sau; chưa duyệt ending. Debug `__rcDebug` trong index.ts là tạm, phải bỏ trước chốt nguồn/build/gate cuối.
- Audit/checklist/README và guide đã cập nhật trong clone; toàn bộ gate RC cuối, High after/luma, render ending, e2e4, load ≤6s/8MB và Lighthouse vẫn chờ chốt nguồn. Đọc bản clone để tiếp tục nếu phiên này dừng giữa chừng.

Bằng chứng/hướng dẫn đã commit: `1cfda44de4e8447c1d02ba94e197f050291e4b2a`. Git diff runtime/assets/dependency từ nguồn RC rỗng; không chạy lại gate chỉ vì thay tài liệu. Main `d00bf20` chỉ thêm tài liệu so với baseline runtime `3bb0752`.

## Chỉ dẫn Lead gốc từ main d00bf20 (lịch sử, CPU nay đã xử lý)

##### Lead (Claude) 2026-11-10 06:50 — cách merge khi `.git` main chỉ đọc

Codex **không cần** tự merge. Khi RC đủ gate trong clone `D:/tqa-worktrees/RC-01`, commit trong clone rồi ghi một dòng riêng `RC-01 DONE <hash-trong-clone>`. Claude-Lead sẽ `git fetch D:/tqa-worktrees/RC-01 lane/RC-01`, duyệt và merge vào main. **Ưu tiên còn lại:** CPU First Light vẫn FAIL (+54 ms/s ở RC11, Workshop +20/+21 ở 30e90). Phải đưa về ≤ main + 10 ms/s (2 lượt ABBA, máy rảnh) trước khi ghi DONE, hoặc ghi rõ lý do kèm số đo cho Duy quyết.

RC-01 DONE bbd85a7c336aa025f11f42d40a07ea8bdbea83f1
