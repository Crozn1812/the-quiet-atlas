## TICKET B2-231: trang Welcome theo hướng A (ảnh world hoàng hôn + thẻ tạp chí)

- Đọc `_ux-common.md`, spec §3.1 (Welcome: tên, vai trò, Enter World, Quick Portfolio, Sound, link CV; HTML độc lập không cần WebGL/JS), ADR 0009 (shell toàn màn hình), art bible.
- Được sửa: `src/components/portfolio/ForestBackdrop.tsx` (hoặc thay bằng component nền mới trong cùng thư mục), `src/components/portfolio/Portfolio.tsx` / `WorldEntry.tsx` (**chỉ** markup/class Welcome), phần Welcome trong `src/app/portfolio.css`, test unit liên quan. Ảnh nền có sẵn: `public/welcome/hero-coast-1920.webp` (27 KB) và `hero-coast-960.webp` (10 KB), đã ghi `assets/LICENSES.csv`.
- Ảnh hiện trạng: `docs/showcase/28-ux/hien-trang/welcome.webp`: nền cây vẽ phẳng kiểu cũ (không khớp hướng A), thẻ thông tin nhỏ dồn góc trái dưới, nút như mặc định trình duyệt.

### Việc

1. Nền: `<picture>` dùng 2 ảnh (960 cho ≤ 900 px, 1920 cho lớn hơn), `object-fit: cover`, có `width/height`, `fetchpriority="high"`, `alt=""` (trang trí); lớp phủ gradient nhẹ màu giấy/mực ở phía thẻ để chữ đạt tương phản AA. Bỏ cây vẽ phẳng.
2. Thẻ: kiểu trang bìa tạp chí: tên lớn (serif đậm), vai trò, câu giới thiệu; **Enter World** là nút chính (giấy kem, viền mực mảnh, chữ in hoa giãn), Quick Portfolio / CV / email / Âm thanh / ngôn ngữ là link chữ nhỏ cùng hệ UI B2-230. Thẻ đặt bên trái ở desktop (ngang tầm mắt, không dồn góc dưới), full-width dưới cùng ở mobile.
3. Giữ nguyên: mọi nội dung, link, nhãn, thứ tự focus, `data-*` mà e2e dùng, phát hiện năng lực (Editorial/coarse pointer), Welcome hoạt động khi tắt JS/WebGL, 0 chunk 3D trước Enter World.
4. Ngân sách: Welcome initial transfer ≤ 1 MB, JS gzip không tăng quá 1 KB; Lighthouse/axe không tệ hơn.

### Test

- Unit hiện có pass; nếu có snapshot/markup test thì cập nhật có lý do.
- e2e/Lighthouse: NOT RUN trong sandbox; Lead chạy.
