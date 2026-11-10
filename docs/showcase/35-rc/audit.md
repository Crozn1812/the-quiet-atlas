# RC-01 — audit ứng viên phát hành

**RC đã kiểm, sẵn sàng để Duy test local:** `bbd85a7c336aa025f11f42d40a07ea8bdbea83f1`. Build, strict gate, full e2e 4 worker, CPU, tải lạnh RC ≤6 s/8 MiB, Lighthouse, CV và duyệt render trên hash này đã PASS. T08/T09 Iris Xe vẫn NOT RUN; T10 và điểm cảm nhận do Duy chấm vẫn DEFERRED.

Nguồn bắt đầu: main `3bb0752`. Bản RC nằm tại clone độc lập `D:/tqa-worktrees/RC-01`, nhánh `lane/RC-01`; chưa merge main, chưa push vì `.git` repo chính chỉ đọc. Theo chỉ dẫn Lead trong handoff, Claude-Lead sẽ fetch/duyệt/merge clone. Kết quả lịch sử bên dưới giữ nguồn riêng, không đổi hồi tố các FAIL/BLOCKED.

## Phạm vi đã kiểm

Lượt UI thứ hai ngày 2026-11-09 chạy Edge có cửa sổ `157.0.4341.42`, desktop **1600×900**, VI/EN và mobile cảm ứng giả lập **390/320×844**. [Kết quả máy](ui-audit/results.json) và [140 bước kèm ảnh](ui-audit/steps.md): **PASS 140/140 assertion** trên export `d761a62` (nguồn theo bàn giao Lead). `goTo`, `visitSecret`, `nearVehicle` chỉ hỗ trợ đặt vị trí; mở overlay bằng WASD/E, Menu, xe và lan can dùng input thật. Lượt đầu có 5 FAIL harness và được giữ nguyên ở [ui-audit-first](ui-audit-first/steps.md).

| Bước | Kết quả đã chạy / giới hạn | Ảnh VI / EN |
|---|---|---|
| Welcome → Enter World → tải → intro xem hết | PASS thao tác; loading quan sát được ở cả VI/EN; không dùng hook Skip | [tải VI](ui-audit/vi-loading-full.webp), [tải EN](ui-audit/en-loading-full.webp), [intro VI](ui-audit/vi-intro-full.webp), [intro EN](ui-audit/en-intro-full.webp) |
| Vào lại → Skip | PASS nút Skip thật | [VI](ui-audit/vi-intro-skip-real.webp), [EN](ui-audit/en-intro-skip-real.webp) |
| Đi bộ First Light → Last Postcard | PASS phép đo tuyến độc lập: **367,91 s; 1098,12 m; 0 lần kẹt**, Edge 1366×800, W + camera arrows, không teleport/Shift. Không chứng minh mọi nhánh phụ hay mọi góc camera đều không xuyên | [journey.md](journey/journey.md), [dữ liệu](journey/journey.json), [kiểm input](journey/movement-check.json); phép đo tuyến không lưu ảnh từng chướng ngại |
| 8 khu, tìm tương tác và bấm E mở/đóng overlay | PASS cả VI/EN; đi tới khu bằng hook, tiếp cận nội dung bằng WASD/E thật | Bảng 8 khu bên dưới |
| Sổ Atlas | PASS mở bảng | [VI](ui-audit/vi-journal.webp), [EN](ui-audit/en-journal.webp) |
| Menu Low / Balanced / High | PASS chọn cả ba mức | [VI Low](ui-audit/vi-menu-quality-low.webp), [Balanced](ui-audit/vi-menu-quality-balanced.webp), [High](ui-audit/vi-menu-quality-high.webp), [EN High](ui-audit/en-menu-quality-high.webp) |
| Ngôn ngữ / giảm chuyển động / âm thanh | PASS điều khiển và trạng thái; **NOT RUN nghe âm thanh bằng người** | [VI ngôn ngữ](ui-audit/vi-menu-language.webp), [EN ngôn ngữ](ui-audit/en-menu-language.webp), [giảm chuyển động](ui-audit/vi-menu-reduced-motion.webp), [âm thanh](ui-audit/vi-menu-sound.webp) |
| “Đi tới…” | PASS mở bằng E thật | [VI](ui-audit/vi-chooser-key-e.webp), [EN](ui-audit/en-chooser-key-e.webp) |
| GD110: lên / chạy / tự chạy / phanh / xuống | PASS trạng thái và chuyển động; chạy tay VI 13,27 m / EN 13,53 m, tự chạy VI 13,12 m / EN 13,21 m; drift sau phanh 0 | [lên](ui-audit/vi-bike-mount.webp), [chạy](ui-audit/vi-bike-manual-movement.webp), [tự chạy](ui-audit/vi-bike-cruise.webp), [phanh](ui-audit/vi-bike-brake.webp), [xuống EN](ui-audit/en-bike-dismount.webp) |
| 4 bí mật → cảnh kết | PASS discovery đếm 1→4 và chặn trang cuối khi chưa đủ; dùng hook đặt vị trí. Ảnh audit cũ có lỗi; Lead đã duyệt bộ sau sửa ở `ending-source-final/` (nguồn và giới hạn bên dưới) | [chưa đủ](ui-audit/vi-secret-page-not-yet.webp), [1](ui-audit/vi-secret-reflection.webp), [2](ui-audit/vi-secret-forgotten-sound.webp), [3](ui-audit/vi-secret-unmarked-road.webp), [4](ui-audit/vi-secret-unwritten-page.webp), [kết EN](ui-audit/en-ending-full.webp) |
| Tựa / rời lan can | PASS WASD/E/Escape thật | [VI](ui-audit/vi-railing-real-key-approach.webp), [EN](ui-audit/en-railing-real-key-approach.webp), [rời](ui-audit/vi-railing-exit.webp) |
| Thoát world → Welcome → Quick | PASS cả VI/EN | [thoát](ui-audit/vi-exit-world.webp), [Welcome](ui-audit/vi-desktop-welcome.webp), [Quick VI](ui-audit/vi-desktop-quick.webp), [Quick EN](ui-audit/en-desktop-quick.webp) |
| CV và 4 case study mỗi ngôn ngữ | PASS 2 PDF HTTP 200, application/pdf và signature `%PDF-`; 8 trang case study mở được. Lead lần 1 đã xem 4 trang PDF VI/EN sau RC-08; JSON UI không tự xác nhận đọc nội dung/layout PDF | [CV VI](ui-audit/vi-cv-links.webp), [CV EN](ui-audit/en-cv-links.webp), [case VI](ui-audit/vi-case-study-1.webp), [case EN](ui-audit/en-case-study-1.webp); đủ 8 trang trong [steps](ui-audit/steps.md) |
| Mobile Welcome / Quick / thông báo world cần chuột | PASS assertion 390/320 px VI/EN; giả lập cảm ứng, chưa test điện thoại thật | [VI 390 Welcome](ui-audit/vi-mobile-390-welcome.webp), [Quick](ui-audit/vi-mobile-390-quick.webp), [VI 320](ui-audit/vi-mobile-320-welcome.webp), [EN 390](ui-audit/en-mobile-390-welcome.webp), [EN 320 Quick](ui-audit/en-mobile-320-quick.webp) |
| Lỗi JavaScript chưa xử lý | PASS không ghi nhận trong lượt UI cả hai locale | [VI](ui-audit/vi-uncaught-errors.webp), [EN](ui-audit/en-uncaught-errors.webp) |

## 8 khu và camera R1

RC-02 chụp lại 8 postcard High 960×640 (21.926–51.244 B), Lead lần 1 đã xem đủ và chọn Welcome hero-0; [manifest postcard](postcards/zone-renders.json), [hero](welcome-candidates/hero-0-960.webp). Camera có 64 ảnh trước/sau và 8 contact sheet mỗi bản. Theo bàn giao Lead lần 1, đã xem đủ 8 contact sau RC-09 (`77700fc`): hết phóng sát thân do biển mảnh; mẫu cây R1 không che kín actor. Một số góc biển chỉ đường vẫn che một phần thân người. Đây là kiểm mẫu, không khẳng định mọi vị trí đều sạch.

Lead lần 3 đã mở đủ 8 ảnh High `after/` trên `4d627b1`. Luma so `before/` lệch tối đa **0,001**, trong trần ±0,03; ground hue giữ nguyên, riêng Last Postcard 61→62. [Luma trước](checks/luma-before.txt), [sau](checks/luma-after.txt), [hue trước](checks/ground-before.txt), [sau](checks/ground-after.txt).

Trên `ccd9145`, [8 High sau RC-21](after-ccd9145/) có [luma giữ nguyên so `4d627b1`](checks/luma-ccd9145.txt); bộ này chưa mở từng ảnh, giữ làm lịch sử. [Cinematic `ccd9145`](visual-ccd9145/results.json) capture PASS 15 ảnh, 0 lỗi JavaScript, Lead đã xem các khung ghi trong bàn giao.

**Bộ cuối `bbd85a7`: PASS duyệt render.** Lead mở từng ảnh đủ 8 High `after-bbd85a7/` và đủ 15 PNG intro/ending `visual-bbd85a7/`, tất cả quality High, 0 lỗi JavaScript theo [capture](visual-bbd85a7/results.json). Luma lệch tối đa **0,001** so trước; hue chỉ Last Postcard 61→62, còn lại giữ nguyên: [luma](checks/luma-bbd85a7.txt), [hue](checks/ground-bbd85a7.txt). Intro trả điều khiển sau khoảng 22 s; ending hết cạnh tam giác biển rõ, actor ngoài bench, HUD không chồng chip E.

| Khu | High cuối `bbd85a7` đã mở duyệt | Overlay E VI / EN | Camera sau RC-09 |
|---|---|---|---|
| First Light | [ảnh](after-bbd85a7/ingame-first-light.png) | [VI](ui-audit/vi-overlay-first-light-key-e.webp) / [EN](ui-audit/en-overlay-first-light-key-e.webp) | [8 góc](camera-after/first-light-contact.webp) |
| Workshop | [ảnh](after-bbd85a7/ingame-workshop.png) | [VI](ui-audit/vi-overlay-workshop-key-e.webp) / [EN](ui-audit/en-overlay-workshop-key-e.webp) | [8 góc](camera-after/workshop-contact.webp) |
| Roots | [ảnh](after-bbd85a7/ingame-roots.png) | [VI](ui-audit/vi-overlay-roots-key-e.webp) / [EN](ui-audit/en-overlay-roots-key-e.webp) | [8 góc](camera-after/roots-contact.webp) |
| Milestones | [ảnh](after-bbd85a7/ingame-milestones.png) | [VI](ui-audit/vi-overlay-milestones-key-e.webp) / [EN](ui-audit/en-overlay-milestones-key-e.webp) | [8 góc](camera-after/milestones-contact.webp) |
| Old Trail | [ảnh](after-bbd85a7/ingame-old-trail.png) | [VI](ui-audit/vi-overlay-old-trail-key-e.webp) / [EN](ui-audit/en-overlay-old-trail-key-e.webp) | [8 góc](camera-after/old-trail-contact.webp) |
| Horizon | [ảnh](after-bbd85a7/ingame-horizon.png) | [VI](ui-audit/vi-overlay-horizon-key-e.webp) / [EN](ui-audit/en-overlay-horizon-key-e.webp) | [8 góc](camera-after/horizon-contact.webp) |
| Quiet Shore | [ảnh](after-bbd85a7/ingame-quiet-shore.png) | [VI](ui-audit/vi-overlay-quiet-shore-key-e.webp) / [EN](ui-audit/en-overlay-quiet-shore-key-e.webp) | [8 góc](camera-after/quiet-shore-contact.webp) |
| Last Postcard | [ảnh](after-bbd85a7/ingame-last-postcard.png) | [VI](ui-audit/vi-overlay-last-postcard-key-e.webp) / [EN](ui-audit/en-overlay-last-postcard-key-e.webp) | [8 góc](camera-after/last-postcard-contact.webp) |

## Phát hiện và xử lý

P1: chặn nội dung/chơi hoặc vi phạm công bố; P2: lỗi hiển thị rõ hay hiệu năng gate; P3: thô/cần Duy chấm. Mỗi dòng giữ cả bằng chứng lỗi và giới hạn của kết luận.

| Mức | Bước | Mô tả / xử lý | Ảnh / bằng chứng |
|---|---|---|---|
| P1 | Build sạch → CV | Build cũ chỉ sinh HTML, có thể thiếu PDF/OG. RC-06 nối Next → CV → OG và checker HTTP/PDF thật. Lượt UI sau sửa tải được hai PDF; build và CV checker cuối `bbd85a7` PASS, metadata/nội dung VI–EN và link/no-JS/OG đã kiểm | [ticket RC-06](../../tickets/RC-06-complete-static-build.md), [CV checker cuối](checks/cv-bbd85a7.txt), [CV UI sau sửa](ui-audit/vi-cv-links.webp); không có ảnh lỗi trước sửa |
| P1 | Quick / case study / CV | Placeholder TBD xuất hiện công khai. RC-07/08 bỏ phần nháp, giữ câu đã xác nhận và qualification Lab/demo; không thêm nội dung hay link giả. PDF sau sửa 2 trang mỗi ngôn ngữ theo bàn giao Lead | [RC-07](../../tickets/RC-07-public-placeholders.md), [RC-08](../../tickets/RC-08-cv-publication-layout.md), [Quick sau](ui-audit/vi-desktop-quick.webp), [case sau](ui-audit/en-case-study-1.webp); chưa có ảnh CV trước/sau trong showcase |
| P2 | Welcome / overlay | Ảnh cũ có trước R1. RC-02 chụp mới 8 postcard + hero biển, cập nhật license. Lead đã xem; không đổi dressing để khớp ảnh cũ | [overlay](postcards/overlay-first-light.webp), [hero mới](welcome-candidates/hero-0-960.webp) |
| P2 | Xoay camera cạnh biển chỉ đường | Camera ray hit biển mảnh khiến spring arm rút vào người. RC-09 bỏ biển mảnh khỏi ray camera, giữ collision người/LoS. Lead đã xem 8 contact sau; vẫn cần kiểm CPU và render bản cuối | [trước](camera-before/first-light-contact.webp), [sau](camera-after/first-light-contact.webp), [RC-09](../../tickets/RC-09-signpost-camera.md) |
| P2 | Cảnh kết nhìn biển xa | Mảng tam giác xanh/tối ngoài mặt biển. RC-12 mở quad 6000 m chưa đủ; RC-14 sửa shoreline sentinel và pigment endpoint. Lead mở toàn bộ ending cuối `bbd85a7`: không còn cạnh tam giác rõ. Bộ nguồn `3bdbd0c` giữ riêng làm lịch sử, HUD bộ đó có trước RC-20 | [lỗi](ui-audit/vi-ending-1794239751028.webp), [RC-12](../../tickets/RC-12-ending-sea.md), [RC-14](../../tickets/RC-14-shore-confidence.md), [sau 26 s cuối](visual-bbd85a7/ending-26000.png), [lịch sử](ending-source-final/e-26000.png) |
| P2 | Hook QA tới trang cuối | `visitSecret` đặt actor vào tâm ghế làm ảnh xuyên ghế. RC-13 đặt cạnh ghế; đi bộ thật có swept box chặn, không quy kết đây là lỗi xuyên ghế khi chơi. Lead mở ending cuối `bbd85a7`: actor ở ngoài bench | [lỗi](ui-audit/vi-secret-unwritten-page.webp), [RC-13](../../tickets/RC-13-safe-secret-qa.md), [sau sửa cuối](visual-bbd85a7/ending-00500.png), [lịch sử nguồn `3bdbd0c`](ending-source-final/e-00500.png) |
| P2 | CPU sau camera RC-09 | Baseline Workshop trung bình 246/267 Script/Task ms/s; RC-09 297/321,5 và RC-10 277/298,5: **FAIL** trần +10 ms/s. Harness gốc 1,5 s trên `4d627b1` và RC-21 `ccd9145` vẫn FAIL; bảng số đo bên dưới giữ cả hai. RC-22 `bbd85a7` ABBA hai lượt mỗi bản **PASS**, delta tối đa +3,5/+5 ms/s; không đổi harness, quality hoặc warm-up | [baseline 1](perf/cpu-before-1.txt), [2](perf/cpu-before-2.txt), [RC-09](perf/cpu-after-1.txt), [RC-10](perf/cpu-optimized-1.txt), [các lượt tiếp](perf/); không có ảnh cho phép đo CPU |
| P2 | Chuẩn bị T08/T09 | Harness còn combobox quality cũ và RAM 32 GB ghi cứng. RC-03 đổi radio đúng UI + RAM thực; unit frame-budget 18/18 đạt, **T08/T09 Iris Xe NOT RUN** | [RC-03](../../tickets/RC-03-benchmark-harness.md); lỗi harness không có ảnh |
| P3 | Camera biển | Ở một số hướng, biển chỉ đường đứng trước người che một phần thân; mẫu cây R1 không che kín actor. Để Duy đánh giá khả năng đọc hình | [camera 8 góc Last Postcard](camera-after/last-postcard-contact.webp) |
| P3 | Bưu thiếp Old Trail | Bố cục khá trống, ít thấy cột mốc. Giữ để Duy chấm, có thể chỉnh camera capture sau phản hồi | [postcard](../../../public/zones/old-trail.webp) |
| P3 | Âm thanh / mobile thật | Script chỉ kiểm trạng thái âm thanh và mobile giả lập. Cần nghe thật, kiểm cảm ứng/thiết bị thật trong playtest | [âm thanh](ui-audit/vi-menu-sound.webp), [mobile](ui-audit/vi-mobile-390-welcome.webp) |
| P3 | Welcome mobile 390 px | Tên xuống dòng cuối chỉ còn “Duy” ở VI/EN; bố cục đọc được, không chồng chữ. Để Duy chấm nhịp chữ | [VI](front-bbd85a7/vi-mobile-390-welcome.png), [EN](front-bbd85a7/en-mobile-390-welcome.png) |
| P3 | Footer Welcome mobile | Email rút gọn bằng ellipsis ở 320/390 px, không overflow nhưng không đọc đủ địa chỉ ngay trong footer | [VI 320](front-bbd85a7/vi-mobile-320-welcome.png), [EN 390](front-bbd85a7/en-mobile-390-welcome.png) |

## Welcome, Quick và mobile trên RC cuối

Lead/Art QA đã mở **từng ảnh đủ 12/12 PNG** [front-bbd85a7](front-bbd85a7/results.json): VI/EN × desktop 1600×900 và mobile 390/320×844 × Welcome/Quick. Không thấy thiếu glyph tiếng Việt, cắt dấu, chồng chữ, clipping ngang hay CTA bị che; hero không còn wedge biển rõ. Hai điểm thô mobile ghi ở bảng P3. Đây là ảnh viewport, không chứng minh nội dung Quick cuối trang/case study/CV và không phải chạy lại 140 bước chức năng.

| Bố cục | Welcome VI / EN | Quick VI / EN |
|---|---|---|
| Desktop 1600 | [VI](front-bbd85a7/vi-desktop-welcome.png) / [EN](front-bbd85a7/en-desktop-welcome.png) | [VI](front-bbd85a7/vi-desktop-quick.png) / [EN](front-bbd85a7/en-desktop-quick.png) |
| Mobile 390 | [VI](front-bbd85a7/vi-mobile-390-welcome.png) / [EN](front-bbd85a7/en-mobile-390-welcome.png) | [VI](front-bbd85a7/vi-mobile-390-quick.png) / [EN](front-bbd85a7/en-mobile-390-quick.png) |
| Mobile 320 | [VI](front-bbd85a7/vi-mobile-320-welcome.png) / [EN](front-bbd85a7/en-mobile-320-welcome.png) | [VI](front-bbd85a7/vi-mobile-320-quick.png) / [EN](front-bbd85a7/en-mobile-320-quick.png) |

## Gate trước khi chốt

Các kết quả CPU đều là Script/Task ms/s. Harness gốc giữ warm-up 1,5 s, W 4 s, CDP interval thực, quality Balanced và trần +10 ms/s; không đổi phương pháp để lấy PASS.

| Nguồn / phép đo | First Light | Roots | Workshop | Kết luận |
|---|---|---|---|---|
| `4d627b1` ABBA lần 3, delta so main | +7,5/+8 | +51/+56 | +11,5/+12,5 | FAIL; [log](perf/cpu-run3-base-1.txt) và các file cùng prefix |
| `ccd9145` ABBA, main trung bình | 219/240 | 202/221 | 235,5/255 | Baseline, [lượt 1](perf/cpu-ccd9145-base-1.txt), [2](perf/cpu-ccd9145-base-2.txt) |
| `ccd9145` ABBA, RC trung bình | 245/267,5 | 217,5/238,5 | 256/277 | FAIL: delta +26/+27,5; +15,5/+17,5; +20,5/+22. [Lượt 1](perf/cpu-ccd9145-rc-1.txt), [2](perf/cpu-ccd9145-rc-2.txt) |
| `4d627b1` diagnostic warm-up 15 s, delta | −11,03/−11,91 | −10,10/−10,82 | −8,21/−9,22 | Tham khảo, **không thay gate hoặc xóa FAIL 1,5 s**; [diagnostic](perf/diagnostic-run3-base-1.json) và ba file cùng prefix |
| `bbd85a7` ABBA, main trung bình | 242/263,5 | 229,5/251 | 259/280 | Baseline, [lượt 1](perf/cpu-bbd85a7-base-1.txt), [2](perf/cpu-bbd85a7-base-2.txt) |
| `bbd85a7` ABBA, RC trung bình | 245,5/268,5 | 214,5/234 | 248/268 | **PASS**, delta +3,5/+5; −15/−17; −11/−12. [Lượt 1](perf/cpu-bbd85a7-rc-1.txt), [2](perf/cpu-bbd85a7-rc-2.txt); harness gốc, mỗi tiến trình exit 0 |

| Phép kiểm trên hash RC cuối | Trạng thái hiện ghi nhận |
|---|---|
| Commit RC | **PASS**: nguồn đã kiểm `bbd85a7c336aa025f11f42d40a07ea8bdbea83f1`; [trạng thái máy đọc được](checks/rc-status.json). Commit tài liệu/bằng chứng sau nguồn RC không thay runtime/assets/dependency |
| Merge main | **BLOCKED** trong môi trường Codex vì `.git` main chỉ đọc. Theo ngoại lệ handoff Lead 2026-11-10, Claude-Lead fetch/duyệt/merge clone khi đủ gate; mã và bằng chứng nằm trên `lane/RC-01`. Không push |
| Build và strict gate / unit | **PASS trên `bbd85a7`**: [build](checks/build-bbd85a7.txt), [strict gate](checks/gate-bbd85a7.txt), [unit 1759/1759](checks/unit-bbd85a7.txt), lint 0 warning và typecheck. Unit liên quan trước đó [26/26 PASS](checks/rc22-unit.txt). RC-21 có gate 1755/1755 riêng, không sửa hồi tố FAIL cũ |
| Full e2e 4 worker | **PASS trên `bbd85a7`: 153/153**, 4 worker, 3,3 phút, exit 0: [log](checks/e2e-bbd85a7.txt). Dùng server ngoài để tránh teardown Windows. Nguồn `4d627b1` có lượt [PASS riêng](checks/e2e-4d627b1.txt); lượt đầu treo teardown giữ [BLOCKED](checks/e2e-teardown-blocked-4d627b1.txt) |
| Load-budget vào chơi ≤6 s, 3D ≤8 MiB | **PASS trên `bbd85a7`**, 2 test, 6 tải lạnh VI/EN, exit 0. Worst EN 4620,70 ms, VI 4653,10 ms; 3D 2.128.915 B. [RC check ≤6000 ms/8 MiB](checks/load-rc-summary.json) kiểm riêng vì gate script gốc là 10 s; [log](checks/load-bbd85a7.txt), [EN raw](checks/load-budget.json), [VI raw](checks/load-budget-vi.json) |
| Lighthouse | **PASS trên `bbd85a7`**, 3 URL ×5 lượt =15 report, exit 0; [summary](checks/lighthouse-summary.json), [log](checks/lhci-bbd85a7.txt), [15 HTML/JSON](checks/lighthouse/). Mọi report giữ mobile/simulate/slow 4G/CPU 4×, storage reset bật; median-run assertions không đổi. Lần launcher lỗi fetch CDP và taskkill giữ [FAIL môi trường](checks/lhci-launch-fail-bbd85a7.txt); chạy lại dùng Edge CDP loopback 9333, đổi quyền sở hữu browser/server, không đổi phép đo |
| CV và output build | **PASS trên `bbd85a7`**: [check CV](checks/cv-bbd85a7.txt), nội dung/metadata VI–EN, link tải và no-JS fallback, kích thước OG |
| Bundle / license / asset budget | **PASS trên `bbd85a7`**: [bundle](checks/bundle-bbd85a7.txt), [license](checks/licenses-bbd85a7.txt), [asset](checks/assets-bbd85a7.txt) |
| High đủ 8 khu sau cùng + luma so trước | **PASS trên `bbd85a7`**: Lead mở từng ảnh đủ 8 High [bộ cuối](after-bbd85a7/), luma lệch tối đa 0,001, hue chỉ Last Postcard 61→62. Bộ cũ giữ riêng theo nguồn |
| Intro High | **PASS trên `bbd85a7`**: Lead mở đủ 6 ảnh intro trong bộ cuối, kể cả [sau intro](visual-bbd85a7/intro-after.png); trả điều khiển khoảng 22 s. Hành vi full/Skip thật đã kiểm ở lượt UI trước |
| Ending sau sửa | **PASS trên `bbd85a7`**: Lead mở đủ 9 ảnh ending cuối, [0,5 s](visual-bbd85a7/ending-00500.png), [26 s](visual-bbd85a7/ending-26000.png), [sau kết](visual-bbd85a7/ending-after.png): hết tam giác rõ, actor ngoài bench, HUD không chồng E |
| Gợi ý mascot / chip E | PASS 4/4 VI/EN ×1600/1366 trên `4d627b1`; [geometry và contrast](hint-final/results.json): overlap=false, tương phản 11,7448:1, keysVisible=true |
| CPU hai lượt mỗi bản sau tối ưu | **PASS trên `bbd85a7`**: ABBA hai lượt mỗi bản, Balanced, warm-up 1500 ms, W 4 s, CDP interval thực, trần +10 ms/s; delta Script/Task tối đa +3,5/+5. Giữ FAIL `ccd9145` và các nguồn trước cùng diagnostic tham khảo trong `perf/` |
| T08/T09 laptop Iris Xe | NOT RUN — Duy đo theo [runbook](../../runbook/t08-iris-xe.md) |
| Duy chấm / playtest người thật / T10 | DEFERRED — [guide và bảng điểm](../../playtest/rc-guide.md) |

Lighthouse ghi nhận accessibility **100/100 ở cả 15 lượt**, chỉ số này không thay axe hoặc kiểm bằng người. Median-run đại diện và worst giữ riêng:

| Trang | LCP đại diện (ms) | TBT đại diện (ms) | CLS đại diện |
|---|---|---|---|
| Welcome EN | 2192,52 | 20 | 0,018011 |
| Quick EN | 2189,42 | 38 | 0 |
| Case CMS EN | 2194,21 | 43 | 0 |

Worst trên toàn bộ 15 lượt: LCP **2350,23 ms**, TBT **49 ms**, CLS **0,018288**; đều trong ngưỡng gốc 2500 ms /200 ms /0,1. TBT là proxy lab cho INP; chưa có field INP.

Ảnh chụp và assertion không tự chứng minh thẩm mỹ, âm thanh hoặc hiệu năng laptop. [Checklist](checklist.md) và [lộ trình/bảng điểm](../../playtest/rc-guide.md) để Duy đánh giá; các ô giữ/sửa/bỏ và điểm 1–5 còn trống.
