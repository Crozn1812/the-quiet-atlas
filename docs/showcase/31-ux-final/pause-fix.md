# Sửa cảnh thay đổi sau Menu — QA bổ sung 08/11/2026

Full e2e đầu tiên trên `f20147d`: **149 PASS / 2 FAIL**. Một lỗi là locator trạng thái visited chưa tính khoảng trắng do tên truy cập tự nhiên của trình duyệt; đã giữ nguyên yêu cầu tên khu + chủ đề + visited, chỉ cho phép khoảng trắng trước dấu phẩy. Journal chạy riêng **2/2 PASS** sau sửa.

Lỗi còn lại là ảnh world thay đổi sau khi Menu mở. Đã tái hiện khi chạy một worker: yaw giữ nguyên `0.661043168850687`, nhưng ảnh trước/sau cho thấy ground scatter mới xuất hiện trong lúc `data-world-build="pending"`. Không phải bằng chứng camera nhận phím khi tạm dừng. Ảnh và metadata gốc: `test-results/ux-final/pause-diagnostic/` ở main.

## Thay đổi

- Hàng đợi dựng cảnh phụ chỉ chạy khi intro xong **và** gameplay được phép mô phỏng.
- Gameplay tạm dừng giữ nguyên khung đã vẽ, kể cả khi tải asset bất đồng bộ hoàn thành. RAF, clock, input và cleanup vẫn hoạt động; tiếp tục chơi sẽ vẽ cảnh mới.
- Resize / đổi quality vẫn yêu cầu vẽ lại một khung, tránh buffer trống; cinematic giữ đường render hiện có. Hook chụp ảnh QA cũng yêu cầu redraw khi đổi pose.
- Giữ nguyên phép thử so sánh byte ảnh paused, không thêm sai số hoặc bỏ assertion.

## Bằng chứng

- Build **PASS**.
- Paused-frame e2e: **3/3 PASS** chạy tuần tự; cùng test chứng minh ArrowLeft vẫn xoay camera sau resume.
- Các suite intro / dressing / deferred zones: **34/34 PASS**, gồm hai regression test mới cho queue pause/resume và frame freeze / redraw quality / resume.
- CPU: đo 2 lần mỗi bản, cùng High-capable desktop dev, **Balanced được pin thủ công**, chờ build + network idle, thời gian lấy từ CDP Timestamp thực thay vì chia cố định 4 s. Không phải T08/T09 trên Iris Xe.

| Khu | Script main lần 1 / 2 (ms/s) | Bản sửa lần 1 / 2 | Chênh trung bình | Gate +10 ms/s |
|---|---|---|---|---|
| First Light | 289 / 291 | 291 / 287 | −1 | PASS |
| Roots | 276 / 262 | 272 / 252 | −7 | PASS |
| Workshop | 315 / 286 | 281 / 286 | −17 | PASS |

TaskDuration trung bình chênh lần lượt −0,5 / −7 / −17 ms/s. Báo cáo thô: `test-results/ux-final/cpu-controlled-{base,fix}-{1,2}.txt` ở main.

Các phép đo ban đầu không pin quality được giữ nguyên trong `cpu-{base,fix}-{1,2}.txt`; Roots chênh +18,5 ms/s nên **không được dùng làm PASS**. Sửa harness là để đo cùng quality và đúng khoảng thời gian, ngưỡng không đổi.

Full e2e / tải / Lighthouse cuối: chờ chạy lại sau merge bản sửa này.
