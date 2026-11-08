## TICKET U-01: chữ và nhịp đọc của UI trong world + Quick Portfolio

- **Đọc:** `_ux-common.md`, `_review-common.md` (cổng 4401), `docs/art-bible/` (kiểu chữ, palette), spec §5 (a11y), §6.2.
- **Được sửa:**
  - `src/components/portfolio/` (journal, teleport "Đi tới…", `WorldMenu`, hud, QuickPortfolio, CSS module);
  - `src/app/portfolio.css`;
  - `src/i18n/*` (chỉ khi cần đổi nhãn);
  - test e2e/unit liên quan.
- **Không sửa:** `src/features/world/` (3D).
- **Hiện trạng** (ảnh `docs/showcase/30-do-hoa/hien-trang/ux-*.webp`, 1600×900):
  - Sổ Atlas, Menu, "Đi tới…": tên khu và chú thích chỉ khoảng 9–11 px. Bảng cao kín màn hình nhưng chữ nhỏ, khó đọc. Nhãn cài đặt trong Menu (Thấp / Cân bằng / Cao, Âm thanh…) quá nhỏ, phân cấp phẳng.
  - Quick Portfolio: chữ thân khoảng 11–12 px, lề trống lớn, mục "Kinh nghiệm / Học vấn" khó quét.
  - Thẻ thơ, gợi ý phím: chữ nhỏ.
- **Việc:**
  1. Thang chữ thống nhất, theo `rem`, đổi theo viewport:
     - thân ≥ 16 px;
     - nhãn phụ ≥ 13 px;
     - tiêu đề bảng ≥ 24 px;
     - dòng danh sách ≥ 44 px chiều cao (đủ chạm).
  2. Menu: nhóm "Hành trình", "Cài đặt", "Khác" rõ ràng. Lựa chọn chất lượng và ngôn ngữ là nút segment dễ bấm.
  3. Quick: cột đọc 60–72 ký tự, thân 17–18 px, mục có tiêu đề nổi rõ.
  4. Focus nhìn thấy được (viền 2 px), tương phản AA. Giữ đúng hành vi bàn phím hiện có (e2e menu, journal, teleport).
- **Nghiệm thu:**
  - Ảnh trước/sau bằng `node tools/review/ux-shots.mjs <dir>` (sửa cổng);
  - axe không lỗi mới;
  - `pnpm test:e2e` các spec world-menu, world-journal, teleport, a11y pass;
  - JS Welcome ≤ 150 KB.
