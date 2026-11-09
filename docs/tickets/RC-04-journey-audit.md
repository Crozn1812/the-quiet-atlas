# RC-04 — Script audit hành trình UI có bằng chứng từng bước

- Lane: QA / RC-01.
- Được sửa: `tools/review/rc-audit.mjs`, ticket này; sửa ba ghi chú lỗi đã biết trong `docs/playtest/rc-guide.md`.
- Mục tiêu: chạy Edge có cửa sổ 1600×900, cả VI/EN; lưu trạng thái từng bước ngay khi bắt đầu/kết thúc và ảnh, giữ kết quả partial khi lỗi.
- Nguồn: `tools/review/intro-shots.mjs`, `ending-shots.mjs`, `tests/e2e/world-railing.spec.ts`, `world-menu.spec.ts`, `world-journal.spec.ts`, `world-travel.spec.ts`, UI và hook world hiện tại.

## Phạm vi

Welcome/tải; intro xem hết và Skip qua nút thật (không hook bỏ intro); 8 khu High bằng `goTo`, tìm nội dung bằng WASD rồi E thật; Sổ Atlas; quality/giảm chuyển động/âm thanh/ngôn ngữ; chooser E thật; xe lên/chạy/tự chạy/phanh/xuống với trạng thái và chuyển động; secret hook có sự kiện discovery, cảnh kết; lan can bằng WASD/E/Escape; thoát world; Quick, CV PDF response và case study; mobile cảm ứng 390/320 cho VI/EN.

Hook đi tới/bí mật/đứng cạnh xe được ghi rõ trong JSON; không dùng `tqa:open-content` để thay phím E. Không thay thế chuyến đi bộ thật từ đầu tới cuối hoặc nghiệm thu ảnh/nghe âm thanh bằng người. Ảnh mobile là giả lập, không phải điện thoại thật.

## Chạy riêng sau build

```powershell
node tools/serve-out/index.mjs out --port 4180
# cửa sổ khác, không chạy GPU/browser audit khác cùng lúc:
node tools/review/rc-audit.mjs docs/showcase/35-rc/ui-audit http://127.0.0.1:4180 all
```

Có thể thay `all` bằng `vi` hoặc `en`, dùng thư mục output khác để giữ lần lỗi. Kết quả `results.json`, `steps.md`, ảnh từng bước và ảnh trung gian intro/ending. Script exit 1 khi có FAIL; bắt lỗi từng bước để tiếp tục các phần còn chạy được. Lỗi entry khiến phần world ghi NOT RUN; Quick/mobile vẫn tiếp tục. Nếu loading đã qua trước lúc ảnh 300 ms, trường `loadingObserved=false` phải được Lead ghi nhận là thiếu bằng chứng tải, không suy ra đã kiểm màn tải.

## Kiểm tra

- `node --check tools/review/rc-audit.mjs`: **PASS**, exit 0 (2026-11-09).
- `node node_modules/eslint/bin/eslint.js tools/review/rc-audit.mjs --max-warnings=0`: **PASS**, exit 0. Không thêm unit test mô phỏng thao tác script; cần chạy browser để xác nhận hành trình thật.
- Browser audit: **NOT RUN** trong ticket, để Lead chạy tuần tự sau khi chụp ảnh tài nguyên xong.
- Không đổi logic sản phẩm, ngưỡng hiệu năng hay lưu tiến trình chơi.

## Sửa harness sau lượt audit 1

- Giữ kết quả lần đầu ở `ui-audit-first`; các FAIL đã đo không bị sửa hồi tố. Root báo 5 FAIL: tìm hint Milestones VI/EN, Quiet Shore EN, locator CV VI/EN.
- CV theo liên kết thật Quick → `/cv/`, kiểm hai PDF EN/VI bằng HTTP thành công, `application/pdf` và signature `%PDF-`; ảnh cuối bước là trang CV. Lấy danh sách case study từ Quick trước khi đi CV.
- Tìm hint bằng đọc DOM nullable, không chờ locator 15 giây khi hint vắng. Mở rộng tuyến WASD giữa đường từ −8 tới +24 m so với arrival rồi vai đường ±3/±6 m để bao placement Milestones +16 và porch Quiet Shore ±9. Ghi vị trí thực tế/hint tại mỗi waypoint, giữ toàn bộ trong lỗi nếu không tìm được; không dùng sự kiện giả mở nội dung.
- Thêm ảnh camera gần mỗi khu bằng wheel về clamp 4 m rồi phục hồi 12 m (pitch cố định, không có ArrowDown); kiểm world không pause. **Đạt thao tác không đồng nghĩa ảnh đẹp**: trường `visualApproval=NOT RUN`, Lead phải xem ảnh tìm che khuất/xuyên cây đá.
- Chưa chạy browser lượt 2 trong ticket; Lead chạy `all` sau build mới, vào output mới để giữ bằng chứng lần đầu.
