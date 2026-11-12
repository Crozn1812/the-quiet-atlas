# RC-01 — checklist để Duy duyệt

RC đã kiểm, sẵn sàng test local clone: `bbd85a7c336aa025f11f42d40a07ea8bdbea83f1`. [Audit và giới hạn](audit.md) · [Hướng dẫn chạy + lộ trình 20–30 phút + bảng điểm 1–5](../../playtest/rc-guide.md). Trước khi test, ghi commit `____________`, máy `____________`, ngày `____________`.

Duy đánh dấu một lựa chọn và ghi chỗ muốn đổi. Để trống mục chưa xem; kết quả assertion của script không điền thay ý kiến của Duy.

| Hạng mục | Bằng chứng hiện có | Giữ | Sửa | Bỏ | Ghi chú |
|---|---|---|---|---|---|
| First Light | [High](after-bbd85a7/ingame-first-light.png) · [overlay](ui-audit/vi-overlay-first-light-key-e.webp) | [ ] | [ ] | [ ] | |
| Workshop | [High](after-bbd85a7/ingame-workshop.png) · [overlay](ui-audit/vi-overlay-workshop-key-e.webp) | [ ] | [ ] | [ ] | |
| Roots | [High](after-bbd85a7/ingame-roots.png) · [overlay](ui-audit/vi-overlay-roots-key-e.webp) | [ ] | [ ] | [ ] | |
| Milestones | [High](after-bbd85a7/ingame-milestones.png) · [overlay](ui-audit/vi-overlay-milestones-key-e.webp) | [ ] | [ ] | [ ] | |
| Old Trail | [High](after-bbd85a7/ingame-old-trail.png) · [overlay](ui-audit/vi-overlay-old-trail-key-e.webp) | [ ] | [ ] | [ ] | |
| Horizon | [High](after-bbd85a7/ingame-horizon.png) · [overlay](ui-audit/vi-overlay-horizon-key-e.webp) | [ ] | [ ] | [ ] | |
| Quiet Shore | [High](after-bbd85a7/ingame-quiet-shore.png) · [overlay](ui-audit/vi-overlay-quiet-shore-key-e.webp) | [ ] | [ ] | [ ] | |
| Last Postcard | [High](after-bbd85a7/ingame-last-postcard.png) · [overlay](ui-audit/vi-overlay-last-postcard-key-e.webp) | [ ] | [ ] | [ ] | |
| Welcome và hero mới | [desktop VI](front-bbd85a7/vi-desktop-welcome.png) · [EN](front-bbd85a7/en-desktop-welcome.png) | [ ] | [ ] | [ ] | |
| Intro | [sau intro `bbd85a7`](visual-bbd85a7/intro-after.png) · [18 s](visual-bbd85a7/intro-18000.png) · [Skip thật lượt UI](ui-audit/vi-intro-skip-real.webp); bộ High cuối đã duyệt | [ ] | [ ] | [ ] | |
| Camera gần / cây R1 / biển chỉ đường | [8 khu, các góc gần và xa](audit.md#8-khu-và-camera-r1) | [ ] | [ ] | [ ] | |
| Atlas / Menu / Đi tới… | [Atlas](ui-audit/vi-journal.webp) · [Menu](ui-audit/vi-menu-quality-high.webp) · [Đi tới](ui-audit/vi-chooser-key-e.webp) | [ ] | [ ] | [ ] | |
| GD110 | [chạy](ui-audit/vi-bike-manual-movement.webp) · [tự chạy](ui-audit/vi-bike-cruise.webp) | [ ] | [ ] | [ ] | |
| Bí mật / cảnh kết | `bbd85a7`: [kết 26 s](visual-bbd85a7/ending-26000.png) · [ngoài ghế](visual-bbd85a7/ending-00500.png) · [sau kết, HUD mới](visual-bbd85a7/ending-after.png); Lead đã mở đủ 9 ảnh ending cuối | [ ] | [ ] | [ ] | |
| Tựa lan can | [VI](ui-audit/vi-railing-real-key-approach.webp) · [EN](ui-audit/en-railing-real-key-approach.webp) | [ ] | [ ] | [ ] | |
| Quick / CV / case study | [Quick cuối](front-bbd85a7/vi-desktop-quick.png) · [CV checker cuối](checks/cv-bbd85a7.txt) · [case lượt audit](ui-audit/vi-case-study-1.webp) | [ ] | [ ] | [ ] | |
| Mobile Welcome / Quick | [390 px](front-bbd85a7/vi-mobile-390-welcome.png) · [320 px](front-bbd85a7/en-mobile-320-quick.png); giả lập, ảnh viewport RC cuối | [ ] | [ ] | [ ] | |

Kiểm kỹ thuật hoàn tất trên hash RC; các ô Giữ/Sửa/Bỏ phía trên để Duy tự điền:

- [x] Hash RC đã kiểm `bbd85a7c336aa025f11f42d40a07ea8bdbea83f1`.
- [x] RC-22 build, strict gate lint/typecheck/unit 1759/1759 PASS; unit liên quan trước đó 26/26 PASS.
- [x] Bundle/license/asset trên RC-22 PASS; log theo hash trong `checks/`.
- [x] CV trên RC-22 PASS, log `checks/cv-bbd85a7.txt`.
- [x] Full e2e RC-22 153/153, 4 worker, 3,3 phút, exit 0. Lượt cũ `4d627b1` treo teardown giữ BLOCKED riêng.
- [x] RC-22 load-budget 6 tải lạnh VI/EN, worst 4653,10 ms và 3D 2.128.915 B; kiểm riêng RC ≤6 s /8 MiB PASS.
- [x] RC-22 Lighthouse 15 lượt/3 URL, median-run assertions gốc PASS; tất cả profile mobile/simulate/slow 4G/CPU 4× và accessibility 100. Worst LCP 2350,23 ms /TBT 49 ms /CLS 0,018288. Lỗi launcher đầu giữ riêng.
- [x] Bộ `4d627b1` High đủ 8 khu `after/`, Lead mở cả 8; luma lệch tối đa 0,001, ground hue Last Postcard 61→62, còn lại giữ nguyên.
- [x] RC-22 `bbd85a7`: Lead mở từng ảnh đủ 8 High cuối; max luma delta 0,001 so trước, hue Last Postcard 61→62, còn lại giữ nguyên. Bộ `ccd9145` chưa mở từng ảnh giữ riêng làm lịch sử.
- [x] `ccd9145` capture cinematic 15 ảnh PASS, 0 lỗi JavaScript; Lead mở intro sau kết thúc và ending 0,5/26 s/sau kết, HUD mới đã sửa. Camera 64 ảnh trước/sau đã xem ở lượt 1.
- [x] Intro/ending trên RC-22: Lead mở từng ảnh đủ 15 PNG High, capture PASS 0 lỗi JavaScript. Intro trả điều khiển khoảng 22 s; ending hết wedge, actor ngoài bench, HUD không chồng chip E.
- [x] Mascot/chip E: 4/4 VI/EN ×1600/1366 không chồng, tương phản 11,7448:1 trên `4d627b1`.
- [x] Welcome/Quick RC cuối: đã mở từng ảnh đủ 12 PNG VI/EN desktop1600/mobile390/320, không thiếu glyph/cắt dấu/chồng chữ; hai điểm thô P3 giữ trong audit. Không gọi đây là chạy lại 140 bước chức năng.
- [x] CPU `bbd85a7` ABBA hai lượt mỗi bản PASS, delta tối đa +3,5/+5 ms/s, trong trần +10. Giữ FAIL cả ba khu của RC-21 và các lượt trước; diagnostic 15 s chỉ tham khảo. Harness gốc Balanced / warm-up 1,5 s / W 4 s không đổi.
Main chưa merge do `.git` chỉ đọc; Claude-Lead fetch/duyệt/merge `lane/RC-01` từ clone theo handoff. Chưa push. PROJECT_STATUS và dòng bàn giao cuối do Lead cập nhật.

T08/T09 Iris Xe: **NOT RUN**. T10/playtest người thật và điểm 1–5: **DEFERRED** đến khi Duy test; không điền thay.
