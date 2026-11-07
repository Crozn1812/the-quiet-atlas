## TICKET G-03: đá, khúc gỗ, prop có chi tiết (mẫu cho vòng duyệt gu)

- **Đọc:** `_graphics-common.md` (cổng 4303).
- **Được sửa:**
  - `tools/assets/blender/` (script mới cho đá và gỗ);
  - `public/world/props/` (thư mục mới);
  - `assets/LICENSES.csv`;
  - `src/features/world/foliage/ground.ts` (đá, khúc gỗ, bụi);
  - `src/features/world/props/*`;
  - test liên quan.
- **Không sửa:** `shapes.ts`, `instances.ts` (thuộc G-02), `terrain/*` (thuộc G-01), `index.ts`.
- **Hiện trạng:** đá là khối đa diện màu xám phẳng; khúc gỗ, ghế, hàng rào đều là khối hộp.

### Việc

- **Đá:** ≥ 4 biến thể (đá nhỏ ≤ 200 tam giác, tảng lớn ≤ 400 tam giác); cạnh vát, rêu ở mặt trên (màu đỉnh), AO nướng.
- **Khúc gỗ:** có vân ở đầu cắt.
- **Ghế, hàng rào:** đọc được ván và đinh từ khoảng 5 m.
- **Xuất file:** GLB + meshopt, tải deferred; khi chưa tải xong thì dùng bản procedural hiện có.

### Nghiệm thu

- Ảnh cận (`extras-shots.mjs`: các bí mật, gần xe) và ảnh 8 khu, trước/sau.
- Dung lượng và số tam giác nằm trong bảng ngân sách.
