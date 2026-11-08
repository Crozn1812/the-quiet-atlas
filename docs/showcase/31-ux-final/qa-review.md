# Kiểm tra tích hợp UX/UI — 08/11/2026

## Sửa lỗi trong vòng QA

- Hook chụp bưu thiếp chỉ gỡ listener khi thực sự được đăng ký trong chế độ journey QA. Năm bộ test lifecycle đã phát hiện và kiểm tra lại lỗi này.
- Sổ Atlas và hộp Đi tới… dùng tên truy cập từ nội dung hiển thị (tên khu và chủ đề), thay vì `aria-label` ghi đè thiếu nội dung. Trạng thái đã ghé vẫn được đọc cho người dùng trình đọc màn hình. Các test tương ứng được cập nhật theo tên truy cập thực tế.
- Cột số La Mã rộng hơn và không xuống dòng ở VIII.

## Bằng chứng đã chạy trước merge

- Strict gate: **PASS**, lint 0 warning, typecheck, 1695/1695 unit. Trên Windows dùng `bash -c 'pnpm() { pnpm.cmd "$@"; }; export -f pnpm; bash tools/lead/gate.sh D:/tqa-worktrees/UX-final'`; function chỉ gọi đúng executable `.cmd`, không che mã lỗi.
- Build: PASS.
- Bundle: PASS; Welcome JS gzip 135,0 KB; tổng tải tĩnh lớn nhất 212,6 KB. Không có chunk world trong tải ban đầu.
- License: PASS, 35 file public.
- Audit trình duyệt: **12/12 PASS**, không có axe critical/serious, lỗi trang hay tràn ngang. Menu / Sổ Atlas / Đi tới… ở 1366 và 390 px đều giữ focus qua 18 lần Tab; dialog không vượt viewport. Quick Portfolio cả vi/en ở 1366, 390 và 320 px.
- Đã mở ảnh gốc Sổ Atlas mobile và contact sheet; VIII không còn tách dòng, chữ và nút đọc được.

Lệnh tái lập audit: `node tools/review/ux-audit.mjs test-results/ux-final-audit http://127.0.0.1:4410` sau build và serve export trên cổng 4410. Script không sửa asset.

Ảnh: [ui-contact.webp](ui-contact.webp). Kết quả chi tiết: [ux-audit.json](ux-audit.json).

Full e2e, load-budget và Lighthouse: **NOT RUN trong bước này**; xem [qa-final.md](qa-final.md) cho kết quả sau merge. Các lệnh/worktree và 1.695 unit ở trên là bằng chứng lịch sử trước merge, không phải trạng thái main cuối. T10 / playtest người thật vẫn DEFERRED; T08/T09 trên Iris Xe vẫn NOT RUN.
