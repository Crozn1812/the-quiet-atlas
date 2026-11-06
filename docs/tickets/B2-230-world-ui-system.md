## TICKET B2-230: hệ UI trong world (menu, Sổ Atlas, "Đi tới…", nút, focus)

- Đọc `_ux-common.md`. Được sửa: `src/app/portfolio.css` (phần world UI: `.world-menu`, journal, teleport chooser, HUD, nút/select dùng chung), `src/components/portfolio/WorldMenu.ts`, `worldMenuControls.ts`, `src/components/portfolio/journal/*`, `src/components/portfolio/teleport/*`, `src/components/portfolio/hud/*` (chỉ markup/class), test unit/e2e liên quan nếu đổi selector (giữ role/name để e2e không vỡ).

### Hiện trạng (ảnh `menu.webp`, `journal.webp`, `chooser.webp`)

- Menu: nút viền xám mặc định, `select` gốc của trình duyệt, khoảng cách không đều; trông như form debug.
- Sổ Atlas / "Đi tới…": danh sách chữ trơn, mục đang ở được viền đậm như ô input.
- Tiêu đề dialog có **viền focus nâu dày** (focus bằng script) nhìn như lỗi.

### Việc

1. **Bộ thành phần chung** (CSS): nút chữ kiểu tạp chí (chữ serif nhỏ in hoa giãn chữ, gạch chân mảnh khi hover/focus, không viền hộp), nút bật/tắt dạng chữ + chấm trạng thái, `select` chất lượng thay bằng nhóm radio 3 mức (Thấp/Cân bằng/Cao) cùng kiểu, ngăn cách bằng đường mảnh màu mực nhạt.
2. **Focus:** tiêu đề dialog được focus bằng script dùng `outline: none` (vẫn có tên accessible); mọi control có `:focus-visible` rõ ràng (gạch chân/khung mảnh màu `dusk`), tương phản AA.
3. **Menu:** bố cục 2 nhóm (Hành trình: Sổ Atlas, Quay về đường; Cài đặt: chất lượng, âm thanh, giảm chuyển động, mascot, ngôn ngữ; cuối: Mở Quick Portfolio, Rời world), giấy kem có hạt nhẹ (CSS gradient), bóng đổ mềm, mở/đóng fade 180 ms (tắt khi reduced motion).
4. **Sổ Atlas:** mỗi khu một dòng: số thứ tự kiểu La Mã nhỏ, tên khu, dòng phụ chủ đề (Skills/Projects…), dấu mộc tròn màu `vermilion` khi đã ghé (giữ logic hiện có), khoảng trắng rộng.
5. **"Đi tới…":** cùng kiểu với Sổ Atlas; khu đang ở ghi "(đang ở đây)" mờ, không viền hộp.
6. Không đổi role, tên accessible, phím tắt; không lưu trạng thái.

### Test

- Unit/axe hiện có pass; nếu có test so class/markup thì cập nhật.
- e2e: NOT RUN nếu sandbox không có trình duyệt.
