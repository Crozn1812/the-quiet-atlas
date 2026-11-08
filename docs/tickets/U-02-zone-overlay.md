## TICKET U-02: overlay nội dung khu theo hướng A

- **Đọc:** `_ux-common.md`, `_review-common.md` (cổng 4402), spec §6.2, CLAUDE.md luật "Không import `features/world` từ content renderer".
- **Được sửa:**
  - `src/components/portfolio/WorldContent.tsx`, `ZoneContent.tsx`, `ServerZoneContent.tsx`, `zone-content.module.css`;
  - `public/zones/` (thư mục mới, ảnh tĩnh);
  - `tools/review/` (script chụp ảnh khu);
  - `assets/LICENSES.csv`;
  - test liên quan.
- **Hiện trạng** (`docs/showcase/30-do-hoa/hien-trang/ux-overlay-*.webp`): overlay dùng hình vẽ tay kiểu cũ (giấy kem, suối chữ S nét mảnh, hướng C), lệch với world hướng A. Phần nội dung nhỏ, chiếm khoảng 1/3 bảng, liên kết rất nhỏ.
- **Việc:**
  1. Mỗi khu có 1 ảnh render trong engine:
     - chụp từ build hiện tại (script trong `tools/review/`, Edge, High, khung đẹp riêng cho từng khu);
     - xuất webp 960 px, mỗi ảnh ≤ 60 KB;
     - chỉ tải khi mở overlay (`loading="lazy"`), có `alt` mô tả.
     Ảnh là pixel của chính dự án, ghi "project-original" trong LICENSES.
  2. Bố cục kiểu tạp chí:
     - ảnh lớn nửa trái (hoặc trên cùng ở màn hình hẹp), nội dung bên phải;
     - tiêu đề khu ≥ 32 px, thân ≥ 17 px;
     - liên kết hoặc nút hành động rõ ràng (Quick, CV, case study).
  3. Giữ nguyên: dialog a11y, focus trap, Esc, nút "× Đóng"; không lưu tiến trình.
- **Nghiệm thu:**
  - ảnh overlay 3–4 khu trước/sau;
  - e2e world-content, a11y pass;
  - không có chunk 3D trong trang Welcome/Quick (test hiện có);
  - JS Welcome ≤ 150 KB.

### Trả lại vòng 1 (Lead)

Bố cục **đạt** (ảnh trái, chữ phải, nút rõ). Ảnh khu **chưa đạt** (`docs/showcase/30-do-hoa/lead-review/u02-r0.webp`): là ảnh chụp camera chơi (nhìn từ trên xuống, tối), còn dính **chip HUD "E — …"** và dock. Yêu cầu: ảnh "bưu thiếp" từng khu — ẩn toàn bộ HUD/hint/nhân vật tuỳ chọn (dùng CSS ẩn `.world-hud`, `[data-hud-keys]`, chip tương tác trước khi chụp, hoặc chụp `canvas` riêng), camera thấp hơn nhìn ngang có trời ở 1/4–1/3 trên khung, chọn góc đẹp nhất của khu (landmark rõ), mức High, sau khi `data-world-build="done"`. Xuất lại 8 ảnh webp ≤ 60 KB. Tự mở và xem 8 ảnh trước khi bàn giao.
