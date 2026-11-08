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

### Trả lại vòng 1

Xem `docs/tickets/_graphics-r1.md`.

### Trả lại vòng 2 (Lead, render High)

GLB đá nhỏ + khúc gỗ đã tải (`assets-loaded.mjs`), nhưng **mặt đất chuyển trắng toàn bộ** ở 7/8 khu (luma 0,83–0,99; ảnh hàng 3 trong `docs/showcase/30-do-hoa/lead-review/g-r1-crops.webp`). Khả năng: khi nạp GLB, code đổi vật liệu/màu dùng chung (ví dụ `traverse` gán lại `material`/`color`/`vertexColors` hoặc colorSpace) và lan sang vật liệu địa hình; hoặc ground.ts thay mesh bằng GLB có vật liệu trắng. Sửa nguyên nhân; vật liệu GLB không được chia sẻ/ghi đè vật liệu địa hình. Ghế/rào và đá lớn: nối vào khu (được sửa tối thiểu `zones/*` nơi tạo mesh gộp). Rebase lên main mới nhất (G-01/G-02/G-04 đã merge). Tự kiểm: `node tools/review/assets-loaded.mjs http://127.0.0.1:4303` + `TQA_QUALITY=high node tools/review/ingame-shots.mjs <dir> http://127.0.0.1:4303 vi` + `luma.mjs` (luma 8 khu ±0,03 so với main).
