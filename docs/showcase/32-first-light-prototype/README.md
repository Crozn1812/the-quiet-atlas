# First Light — prototype R1, pending Duy review

Source snapshot: `56d29d5c9fae057fa332ffe5e1161a5648854faa` (verified, unmerged).

Đây là **mẫu gu của một khu**, chưa phải UX/UI hoàn thiện và chưa được Duy nghiệm thu. Chụp trực tiếp từ engine của nhánh `lane/FirstLight-R1`; không phải ảnh dựng minh họa. Không merge main, không push; bảy postcard còn lại và Welcome hero giữ nguyên.

## Những gì đang thử

Tán cây nhiều cụm có mặt khối rõ, thân/cành phân nhánh; lớp cây gần/giữa/xa quanh lối đi xanh–cát và điểm chào/sách/ghế. Camera chơi thấp hơn trong khu mẫu để đọc đồng thời mặt đất và tán cây. Phạm vi xử lý cây, cỏ, nền đất và không khí chỉ trong bán kính 48 m quanh First Light, chuyển dần về hành vi gốc bên ngoài. Backdrop xa được ẩn riêng trong khu mẫu khi chơi để tránh các tam giác chân trời; terrain đi được vẫn giữ nguyên, cinematic và các khu khác khôi phục backdrop gốc.

Mẫu cần Duy đánh giá hình khối, màu, mật độ và cảm giác khu rừng trước khi nhân rộng. Các cây kiểu cũ ở ngoài vùng mẫu vẫn có thể thấy xa; đây chưa phải một ngôn ngữ hình ảnh đã triển khai toàn world.

## Ảnh nghiệm thu gu

- `gameplay-balanced.webp`: camera chơi thật sau vào world, giữ gợi ý E tương tác.
- `eye-balanced.webp`, `eye-high.webp`: góc nhìn thấp trong engine.
- `overview-high.webp`: bố cục khu mẫu từ trên cao.
- `overlay-desktop.webp`, `overlay-mobile.webp`: nội dung First Light với postcard thực của nhánh.
- `before-*.webp`: cùng góc trên baseline main e925812.
- `quality-contact.webp`: Low/Balanced/High × ba góc.

## Kiểm tra

1. **UNIT / STATIC — PASS.** Full unit:142 files, 1703/1703 tests (85.10 s), sau source cuối cùng. Sau đó chỉ bổ sung regression test cho staged collider failure/retry; compose 13/13 PASS. Không gọi lần chạy full là 1704. ESLint 0 warning, `tsc --noEmit` và static production build PASS.
2. **RENDER — PASS kỹ thuật; gu PENDING.** Low/Balanced/High: ba góc thực mỗi mức, không console.error/pageerror/WebGL shader compile/link warning. Overlay desktop/mobile dùng đúng postcard 38,444 B (960×640, giới hạn 60 KB), không asset ngoài dự án. Chưa có Duy phê duyệt thẩm mỹ.
3. **REGRESSION — PASS.** High chụp lại đủ bảy khu khác cùng baseline; max |display-luma delta| = 0.001155 < 0.03 (chi tiết `regression-luma.json` và contact sheet); local First Light là thay đổi cố ý. Fog forestWeight giữ đúng contract gốc bên ngoài 48 m, riêng First Light blend về 0; unit cover đi–về và mọi quality.
4. **BUDGET / LOAD — PASS; CPU — FAIL hẹp / chưa kết luận nguyên nhân.** High composer tại spawn: 149,929→142,800 triangles (−4.75%),84→82 mesh draws, dưới +25%. Grove: 280 triangles/tree, 4 draws, không logic animation mỗi frame. CPU dùng 2 cặp baseline/candidate, ba khu, CDP wall interval thật; cold load 3 run/locale EN+VI trên Edge/RTX 3060 với mạng 10 Mbps. Cold load xấu nhất EN 5.34 s / VI 5.38 s, dưới cả trần nội bộ 6 s; world 2,166,471 B < 8 MiB, initial 3D = 0. Hai cặp CPU đầu: ScriptDuration trung bình tăng First Light +7.5, Roots +6.5, Workshop +12 ms/s; Workshop vượt ngưỡng +10. TaskDuration Workshop +12.5 ms/s. Các log giữ đủ cả hai cặp, không loại lần chậm; không gọi CPU PASS.
5. **SIGN-OFF — PENDING.** Full 151 E2E/LHCI NOT RUN trong đợt prototype này; T10/playtest và IrisXe vẫn cần người/máy đúng runbook. Chỉ trình mẫu cho Duy, chưa mở rộng bảy khu.

## Lỗi đã sửa trong kiểm chứng

- Terrain detail GLSL từng trộn vec3 với scalar; sửa kiểu vec3 và bổ sung regression chuỗi hook terrain/quality. Những ảnh lỗi cũ không thuộc gallery này.
- Backdrop High từng tạo gai do ép vertex về mặt đất; bỏ biến dạng vertex, dùng regional fragment suppression, kiểm tra mặc định/outside48m bằng0.
- Grove collider allocation nằm trong guarded initialization; từng collider đã cấp được thu hồi khi lỗi thứ nhất/thứ ba. Deferred bounds thay grove theo transaction, giữ grove/collider cũ nếu staging lỗi, retry và dispose được test.
- Giữ toàn bộ fog metadata ngoài First Light, không bỏ forestWeight của các rừng khác.

## Quota checkpoint và tiếp tục

Lần quota trước báo thực tế “try again 7:28PM”. Root tiếp tục 19:42 giờ Việt Nam ngày 08/11, sau reset 19:28 (đối chiếuUTC 12:42). Thay đổi và ảnh được giữ trong worktree; không gọi lặp worker trước reset. Các PASS trên đây dựa trên log chạy lại, không suy đoán từ phiên trước.

## Lặp lại

`pnpm install --frozen-lockfile`; `pnpm build`; serve out tại 4415. `node tools/review/first-light-shots.mjs test-results/fl-r1-final http://127.0.0.1:4415`; dùng `TQA_OVERLAY_ONLY=1` để chụp riêng overlay mà không ghi đè manifest 9 góc. `TQA_QUALITY=high node tools/review/ingame-shots.mjs <out> <base> vi` cho hồi quy. CPU: `node tools/review/cpu-compare.mjs <base>` lần lượt baseline/candidate hai cặp; coldload: `PERF_PORT=4416 pnpm exec playwright test -c tests/perf/playwright.perf.config.ts load-budget.perf.ts`.

## Một cặp CPU xác nhận đảo thứ tự — diagnostic, không thay gate gốc

Sau khi lưu nguyên kết quả hai cặp **FAIL**, chạy đúng một cặp bổ sung trên cùng source, cùng Balanced/networkidle và khoảng thời gian CDP thực: **candidate4415 trước, baseline4180 sau**. Không sửa source, không chạy tiếp để tìm PASS.

| Khu | Hai cặp gốc Δ Script / Task | Cặp xác nhận Δ Script / Task | Cả ba cặp Δ Script / Task |
|---|---:|---:|---:|
| First Light | +7.5 / +7.5 | +3 / +3 | +6 / +6 |
| Roots | +6.5 / +6.5 | −1 / −2 | +4 / +3.67 |
| Workshop | +12 / +12.5 | +6 / +6 | +10 / +10.33 |

Đơn vị ms trên mỗi giây CDP thực; dấu dương = candidate dùng CPU nhiều hơn. Miss Workshop của hai cặp đầu **không tái hiện trong cặp đảo thứ tự**, nhưng aggregate TaskDuration ba cặp vẫn +10.33 ms/s, hơi vượt +10. Kết luận CPU **chưa dứt điểm / không gọi PASS**; original two-pair FAIL vẫn giữ. Cần giải quyết hiệu năng trước khi gọi release-ready hoặc merge; dữ liệu này chỉ bổ sung bối cảnh cho Duy đánh giá mẫu gu. Toàn bộ sáu raw samples và aggregate có trong `checks/cpu-*.txt` / `checks/cpu-summary.json`. Không có lần đo thêm sau cặp này.
