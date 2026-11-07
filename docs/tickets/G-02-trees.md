## TICKET G-02: cây lá rộng + thông dựng bằng Blender (mẫu cho vòng duyệt gu)

- **Đọc:** `_graphics-common.md` (cổng 4302), `docs/art-bible/materials.md`, `shading.md`, và `tools/assets/blender/pine.py` (mẫu cũ).
- **Được sửa:**
  - `tools/assets/blender/` (script cây mới);
  - `public/world/foliage/` (thư mục mới);
  - `assets/LICENSES.csv`;
  - `src/features/world/foliage/shapes.ts` và `instances.ts`: nạp GLB làm biến thể, giữ nguyên API;
  - test liên quan.
- **Không sửa:** `far-canopy.ts`, `far-landscape.ts` (thuộc B2-241), `index.ts`.
- **Hiện trạng:** tán là các khối đa diện vỡ hạt, thân thẳng, cành mảnh. Cây trông như cây đồ chơi.

### Việc

1. Viết script Blender sinh cây:
   - **≥ 3 biến thể lá rộng**, mỗi cây ≤ 1 500 tam giác;
   - **≥ 3 biến thể thông**, mỗi cây ≤ 1 200 tam giác.
   Yêu cầu hình dáng chung:
   - thân thuôn, gốc loe;
   - 3–5 cành chính thật;
   - tán nhiều thùy, có lỗ thủng nhìn thấy trời;
   - màu đỉnh từ ngọc đến lục, đậm nhạt khác nhau: sáng ở phía trên, tối trong lòng tán (AO nướng vào màu đỉnh).
2. Xuất GLB rồi chạy `optimize.mjs` (meshopt):
   - tải deferred, sau khi đã vào chơi;
   - khi chưa tải xong thì dùng cây procedural hiện có, không chặn thời điểm vào chơi.
3. Giữ nguyên những gì đang có:
   - InstancedMesh;
   - gió;
   - làm mờ tán khi che nhân vật;
   - collider ở thân cây.

### Nghiệm thu

- Ảnh trước/sau của 8 khu và cảnh mở đầu.
- Tổng tam giác ở mức High tăng không quá 25 %.
- Thời gian vào chơi ≤ 6 s.
- Kết quả `cpu-compare.mjs` đạt ngưỡng chung.

### Trả lại vòng 1

Xem `docs/tickets/_graphics-r1.md`.
