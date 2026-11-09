# Duy test bản RC — 20–30 phút

Ghi trước khi test: commit `____________`, ngày `____________`, máy/trình duyệt `____________`. Kết quả kỹ thuật của RC xem [showcase 35](../showcase/35-rc/audit.md); điểm dưới đây do Duy chấm.

## Mở bản local

Trong thư mục chứa bản RC, chạy lần lượt:

```powershell
pnpm install
pnpm build
node tools/serve-out/index.mjs out --port 4180
```

Giữ cửa sổ server mở; dùng Edge vào <http://127.0.0.1:4180/vi/>. Bản tiếng Anh: <http://127.0.0.1:4180/en/>. Dừng server bằng `Ctrl+C`. Lệnh trên chỉ phục vụ máy local (loopback); dùng chế độ thiết bị của Edge để kiểm tra bố cục mobile. Kiểm tra trên điện thoại thật cần server được cấu hình địa chỉ mạng phù hợp riêng.

## Lộ trình

1. **0–4 phút:** xem Welcome, Enter World, màn tải và xem hết intro. Thoát về Welcome, vào lại và thử Skip. Ghi cảm giác chờ tải, khung hình khó nhìn hoặc chuyển cảnh đột ngột.
2. **4–13 phút:** đi theo đường từ First Light → Workshop → Roots → Milestones → Old Trail → Horizon → Quiet Shore → Last Postcard. Dùng WASD, xoay camera; mỗi khu bấm E đọc overlay rồi đóng. Thử camera thấp gần cây/đá; ghi nơi kẹt, xuyên vật thể, che nhân vật/landmark hoặc giật hình.
3. **13–18 phút:** mở Sổ Atlas, Menu, “Đi tới…”. Đổi Low/Balanced/High, VI/EN, giảm chuyển động, âm thanh. Lên GD110 bằng E, chạy, tự chạy, phanh và xuống; xem bảng phím trong Menu.
4. **18–23 phút:** tìm bốn bí mật; kiểm tra trang cuối khi chưa đủ điều kiện rồi quay lại sau khi đủ. Xem cảnh kết; tới lan can cuối đường, tựa và rời lan can. Nếu cần thêm thời gian khám phá, tiếp tục ngoài mốc 30 phút.
5. **23–27 phút:** thoát về Welcome; mở Quick Portfolio, tải/mở CV và từng case study. Đổi EN kiểm tra nội dung, nút và đường dẫn.
6. **27–30 phút:** thử Welcome/Quick trên màn hình hẹp hoặc điện thoại; kiểm tra thông báo world cần chuột, cuộn trang và đọc nội dung. Với laptop gập, thử cả chế độ laptop và tablet.

Chấm **1 = khó dùng/không ổn, 3 = dùng được nhưng cần sửa, 5 = hài lòng**. Để trống mục chưa thử. Khi báo lỗi, ghi bước tái hiện, VI/EN, quality, ảnh/video và điều mong đợi.

| Khu / tính năng | Điểm 1–5 | Ghi chú / giữ–sửa–bỏ |
|---|---|---|
| The First Light | | |
| The Workshop | | |
| The Roots | | |
| The Milestones | | |
| The Old Trail | | |
| The Horizon | | |
| The Quiet Shore | | |
| The Last Postcard | | |
| Welcome, Enter World, tải | | |
| Intro xem hết / Skip | | |
| Đi bộ, va chạm, camera thấp | | |
| Overlay từng khu / đóng / cuộn | | |
| Sổ Atlas | | |
| Menu, Low / Balanced / High | | |
| Chuyển VI / EN | | |
| Giảm chuyển động | | |
| Âm thanh | | |
| “Đi tới…” | | |
| GD110: lên / chạy / tự chạy / phanh / xuống | | |
| Bốn bí mật / điều kiện mở trang cuối | | |
| Cảnh kết | | |
| Tựa / rời lan can | | |
| Thoát world về Welcome | | |
| Quick Portfolio | | |
| CV | | |
| Các trang case study | | |
| Mobile: Welcome / Quick / thông báo cần chuột | | |

## T08/T09 trên laptop Iris Xe (đo riêng sau playtest)

Theo [quy tắc chạy một mình](../runbook/codex-workers.md#việc-chạy-một-mình), [ADR 0007 — quyết định máy nghiệm thu mới nhất](../adr/0007-benchmark-reference-machine.md) và [cấu hình/lệnh đo](../../tests/perf/playwright.frame.config.ts). Laptop tham chiếu: ASUS Vivobook Flip, i5-13500H / Iris Xe / 16 GB. Cắm sạc, Balanced/Cân bằng, tắt tiết kiệm pin; dừng worker/build/Blender và đóng trình duyệt khác. Giữ Edge đo ở phía trước, không thu nhỏ, không thao tác máy trong lúc đo. Ghi commit, OS/browser version, độ phân giải, tần số quét, DPR và nguồn điện.

Sau `pnpm build`, chạy trong PowerShell, lần lượt (cấu hình tự mở server cổng 4175):

```powershell
$env:PERF_MACHINE_LABEL = "laptop iGPU i5-13500H Iris Xe"
pnpm exec playwright test -c tests/perf/playwright.frame.config.ts t08
$env:PERF_LONG = "1"
pnpm exec playwright test -c tests/perf/playwright.frame.config.ts t09
node tools/frame-budget/index.mjs report
Remove-Item Env:PERF_LONG
Remove-Item Env:PERF_MACHINE_LABEL
```

T08 mặc định chạy ba lần cho mỗi kịch bản (khoảng 20 phút): mỗi lần warm-up 30 giây rồi đo 60 giây. **Từng lần Low** phải FPS trung bình ≥30, p95 ≤50 ms, ≤1% frame >100 ms, không frame >250 ms trong đoạn ổn định; Balanced và Low CPU 4× chỉ tham khảo. T09 khoảng 13 phút: 10 phút di chuyển, 20 vòng mở/đóng Menu và overlay; không crash, tài nguyên không tăng liên tục sau warm-up. Không rút ngắn thời lượng để ghi đạt.

Giữ toàn bộ `test-results/frame-budget/` (CSV, JSON, heap snapshots) ở thư mục bằng chứng riêng khi bàn giao. Full e2e chỉ dọn `test-results/e2e-artifacts/`, giữ thư mục frame-budget. Kiểm tra `machine.json`: nhãn máy đúng, GPU Iris Xe, RAM `ram`/`osTotalMemGB` là bộ nhớ khả dụng thực tế theo OS (có thể thấp hơn 16 GB danh định). Nếu script lỗi locator, mất focus/paused hoặc bị throttling, giữ log và báo Lead; lần đó chưa chứng minh T08/T09 đạt.

**T08/T09 Iris Xe: NOT RUN cho đến khi có phép đo hợp lệ trên laptop này.** Kết quả desktop và điểm cảm nhận không thay thế hai phép đo này.
