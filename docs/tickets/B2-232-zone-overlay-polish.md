## TICKET B2-232: overlay nội dung khu kiểu tạp chí hoàn thiện

- Đọc `_ux-common.md`, spec §5 (overlay tạp chí), taste §5.5. Được sửa: `src/components/portfolio/zone-content.module.css`, `src/components/portfolio/ZoneContent.tsx` (chỉ trình bày), test `zone-content*`.
- Ảnh: `docs/showcase/28-ux/hien-trang/overlay-first-light.webp`.

### Hiện trạng

- Tiêu đề khu **lặp hai lần** ("The First Light" ở thanh trên + nhãn nhỏ), thanh trên có viền focus nâu dày.
- Hình minh hoạ là một **vệt mờ xanh** không rõ là gì.
- Khoảng cách và thứ bậc chữ chưa rõ (tên to, vai trò nhỏ dưới mép).

### Việc

1. Một tiêu đề duy nhất (tên khu nhỏ kiểu kicker + tiêu đề nội dung lớn); thanh trên chỉ còn nút Đóng (×) gọn; heading focus bằng script không có viền.
2. Hình minh hoạ: thay vệt mờ bằng **minh hoạ màu nước thủ tục bằng SVG** theo chủ đề khu (First Light: dải suối chữ S + vài thân cây; Workshop: mái chái; Roots: rễ toả; …), nét mực mảnh + mảng màu palette, không ảnh bitmap; ≤ 4 KB mỗi SVG inline.
3. Bố cục 2 cột ≥ 1024 px (minh hoạ trái/phải xen kẽ theo khu), 1 cột trên mobile; độ rộng dòng chữ 60–72 ký tự; khoảng trắng rộng.
4. Khung ảnh film cho ảnh nội dung (nếu có) giữ như ADR 0013.
5. Giữ nguyên nội dung, nhãn, focus trap, Esc/× đóng, trả focus.

### Test

- Test zone-content cũ pass (cập nhật selector nếu đổi). Kiểm: mỗi overlay có đúng 1 `h1`/`h2` tiêu đề; SVG có `aria-hidden="true"`.
