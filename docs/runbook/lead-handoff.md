# RC-01 — hoàn tất lần 3, bàn giao Claude-Lead

Nguồn đã kiểm `bbd85a7c336aa025f11f42d40a07ea8bdbea83f1`; bằng chứng/hướng dẫn đã commit `1cfda44de4e8447c1d02ba94e197f050291e4b2a` tại clone `D:/tqa-worktrees/RC-01`, nhánh `lane/RC-01`. [Bàn giao đầy đủ](../../../tqa-worktrees/RC-01/docs/runbook/lead-handoff.md) · [Showcase](../../../tqa-worktrees/RC-01/docs/showcase/35-rc/README.md) · [Duy test](../../../tqa-worktrees/RC-01/docs/playtest/rc-guide.md).

Đủ gate máy dev: strict1759unit, e2e153/1534worker, loadworst4653,10ms/world2128915B, Lighthouse15mobile/slow4G/CPU4×, CPU ABBA2mỗi bản deltaScript/TaskFL+3,5/+5;Roots−15/−17;Workshop−11/−12ms/s, CV/tài nguyên/renderPASS. Duyệt8High+15cinematic, Art/QA12front; videoQA45s đã decode/seek/xem. T08/T09 NOT RUN; T10/Duy DEFERRED.

Main `d00bf20` chưa merge runtime RC; ngoại lệ Lead06:50 cho phép DONE hashclone để Claude-Lead fetch/duyệt/merge. Không push/cloud/credential. Chỉ có tài liệu trạng thái được cập nhật tại main; mã/assets/test nằm trong clone. Các checkpoint “đang làm” phía dưới là lịch sử đã xử lý, không làm lại.

# Bàn giao UX/UI — 2026-11-08

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

#### Lần 3 — đang tiếp tục tại clone, nguồn `4d627b1`

##### Cập nhật ưu tiên lần3 — `bbd85a7`, đọc checkpoint clone

- Nguồn `bbd85a7c336aa025f11f42d40a07ea8bdbea83f1` gồm RC21/RC22. Build/target26unit/strictgate1759PASS; **CPU harness gốc ABBA2mỗi bản PASS**: deltaScript/Task FirstLight+3,5/+5, Roots−15/−17, Workshop−11/−12ms/s. `perf/cpu-final-summary.json` giữ4log và provenancebaselineworldmain3bb.
- Lead đã mở đủ8Highafter-bbd, luma maxdelta0,001; chuỗi kiểm cuối đang chạy session17459 trong clone. Đọc coverage/rc-*-bbd85a7.log và clonehandoff trước khi chạy lại. Còn renderintro/endingbbd, full e2e4, load≤6s/8MB, Lighthouse, CV và commit báo cáo. Không làm lại UI140/journey. ChưaDONE.

- Đọc checkpoint lần3 trong `D:/tqa-worktrees/RC-01/docs/runbook/lead-handoff.md` và log clone để tiếp tục; không làm lại UI140/journey. Nguồn hiện `4d627b1c3831a6b6b86545cdda499a545524a677`.
- Strictgate1753/1753 và build trên4d PASS; bundle/license/assets lần3 PASS. Lead đã mở8High `after/`, maxdelta luma0,001; mở intro4khung và ending-source-final (hết wedge rõ, actor ngoài ghế), hint-final4caseVI/EN PASS.
- E2E4worker153/153 dòngok nhưng treo teardown server Windows, CHƯA suitePASS. Đã dừng riêng runner/server của lượt; sẽ rerun dùng E2E_PORT4185/reuse server ngoài để tránh taskkill. CPU ABBA3 chuẩn vẫn FAIL Roots; diagnostic15swarmupABBA đang chạy để ghiFPS/CPUframe, không thay ngưỡng.
- Còn full e2e exit0, load≤6s/8MB, LHCI, CPU và báo cáo/commitbằngchứng cuối. Chưa DONE/push. Chỉ dẫn Claude06:50 bên dưới vẫn áp dụng: cloneđủgate thì DONEhashclone cho Claude review/merge.

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

##### Checkpoint mới nhất lần 2: nguồn `6cb4b91`

- RC14 shader đã sửa và unit nước/biển 99/99 PASS; RC15 `09b30e0`, RC16 `9eba0e1`. Debug `__rcDebug` đã bỏ. Runtime/tests/tools/public sạch theo git diff trên `6cb4b918edd7131af9699958a3ad5e8f97b6f4b1`.
- Build cuối trên hash này exit0 (`coverage/rc-build-final.log`). Strict gate đang chạy; đọc `coverage/rc-gate-final.log` và `coverage/rc-gate-tmp/` trước khi quyết định chạy lại. Clone có hai server4185(candidate),4186(baseline world main trong coverage/rc-baseline-out).
- Sau gate: CPU ABBA2 từng bản, High8 after+luma/ground-hue, intro+ending High từ source cuối, full e2e4, load-budget, LHCI. Đừng làm lại UI140/journey.
- 370 PNG UI/Welcome đã nén WebP90 nguyên kích thước (199,1MB→32,7MB); raw+SHA256 ở coverage/rc-raw-screenshots. before/camera/ending giữ nguyên. Scratch .tmp đã chuyển coverage/rc-run1-scratch và coverage/rc-scratch để không lint nhầm. Báo cáo cuối chưa chốt, chưa merge, không ghi DONE.

##### Checkpoint tiếp theo lần 2: ứng viên `d2067a2` (ưu tiên đọc)

- Nguồn `d2067a234af698b2b542f435e02762f57f323ccb` tại clone RC-01. RC14 sửa tiếp `3bdbd0c` (bỏ guard pigment nhị phân gây wedge, khoảng cách tới endpoint thật); Lead đã mở ending-source-final/e-26000.png, e-00500.png, e-after.png: biển không còn cạnh tam giác rõ, actor ngoài ghế. Runtime world source3bdb; RC20 `aea54d1` sửa gợi ý mascot chồng chip E, chưa browser probe.
- RC17 `9a20e57` skip alpha đúng1 khi batch không che; RC18 `fb00637` tránh object tạm cho legacy crowns. CPU trên30e90 trước17/18 FAIL Workshop +20/+21ms/s, giữ perf/cpu-final-*.txt. Đang đo ABBA2 trên d206 (perf/cpu-d2067a2-*.txt), chưa kết luận.
- RC19 d206: chỉ chụp lại Quiet Shore/Last Postcard và hero0 vì shader biển đổi, không làm lại6postcard còn lại. Đã mở2postcard+hero1920; license PASS. Final coast manifest/coast-final; hero/welcome-final-candidates.
- **Build cuối và strict gate d206 PASS**: lint0warning/typecheck/unit1753/1753,154files. coverage/rc-build-final.log, rc-gate-final.log, rc-gate-tmp. checks/ trong showcase đã sao log hiện tại. Lượt6cb FAIL1749/1750 do water-streak evaluator biếncũ được giữ perf/gate-6cb4b91-fail.txt; sửa test30e90 gate1750PASS cũng được giữ checks/*30e90bd.txt. Không sửa hồi tố FAIL.
- Còn: kết luận CPU d206; TQA_QUALITY=high ingame-shots8 after+luma/ground-hue; intro cuối; coverage/rc-scratch/hint-layout.mjs (4caseVI/EN1600/1366, text thật, geometry+contrast). Sau đó full e2e4workers, load-budget≤6s/8MB, LHCI, checkCV/bundle/licenses/assets trên d206. Các full suite này CHƯA CHẠY ở lần2.
- Chưa cập nhật audit/checklist/PROJECT_STATUS cuối, chưa commit toàn bộ showcase. `.git` main vẫn chỉ đọc nên merge BLOCKED, không ghi DONE/push. Không làm lại UI140 và journey đã xong. Trước khi chạy lại phép đo hãy đọc log/current clone và kiểm tra process đang chạy.

##### Lead (Claude) 2026-11-10 06:50 — cách merge khi `.git` main chỉ đọc

Codex **không cần** tự merge. Khi RC đủ gate trong clone `D:/tqa-worktrees/RC-01`, commit trong clone rồi ghi một dòng riêng `RC-01 DONE <hash-trong-clone>`. Claude-Lead sẽ `git fetch D:/tqa-worktrees/RC-01 lane/RC-01`, duyệt và merge vào main. **Ưu tiên còn lại:** CPU First Light vẫn FAIL (+54 ms/s ở RC11, Workshop +20/+21 ở 30e90). Phải đưa về ≤ main + 10 ms/s (2 lượt ABBA, máy rảnh) trước khi ghi DONE, hoặc ghi rõ lý do kèm số đo cho Duy quyết.

RC-01 DONE bbd85a7c336aa025f11f42d40a07ea8bdbea83f1
