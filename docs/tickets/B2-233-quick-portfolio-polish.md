## TICKET B2-233: Quick Portfolio kiểu tạp chí (Track A — không được làm đỏ gate A)

- Đọc `_ux-common.md`, spec §3 (Quick: HTML thuần, đọc được không cần JS/WebGL), §4 (case study). Được sửa: `src/components/portfolio/QuickPortfolio.tsx`, `ProfileHistory.tsx`, `ProjectHeading.tsx` (chỉ trình bày), phần Quick trong `src/app/portfolio.css`, test unit liên quan.
- Ảnh hiện trạng: `docs/showcase/28-ux/hien-trang/quick.webp`: sạch nhưng trơn; danh sách gạch đầu dòng, các mục cùng một kiểu.

### Việc

1. Đầu trang: kicker "The Quiet Atlas · Quick Portfolio", tên lớn, vai trò, câu giới thiệu; liên kết (Chào mừng/Vào world, CV, email, ngôn ngữ) cùng hệ link chữ của B2-230.
2. Kinh nghiệm / Học vấn: dạng **dòng thời gian 2 cột** (cột trái thời gian nhỏ in hoa, cột phải tên + mô tả), bỏ dấu chấm đầu dòng; 1 cột trên mobile.
3. Kỹ năng / Chứng chỉ / Định hướng / Sở thích (nếu đã hiển thị): nhóm nhãn gọn, không bảng nặng.
4. Dự án nổi bật: thẻ dự án (tên, một dòng tóm tắt, trạng thái/thời gian, link case study), đường kẻ mảnh, nhiều khoảng trắng.
5. Không đổi nội dung, thứ tự heading (đúng 1 `h1`, không nhảy cấp — T11), link, JSON-LD; không thêm JS.
6. Ngân sách: initial transfer Quick ≤ 1 MB, JS không tăng; Lighthouse ≥ ngưỡng hiện tại.

### Test

- Unit/T11 heading hiện có pass. e2e/Lighthouse: NOT RUN trong sandbox; Lead chạy.
