## TICKET G-01: texture mặt đất (mẫu cho vòng duyệt gu)

- **Đọc:** `_graphics-common.md`. Cổng review: 4301.
- **Được sửa:**
  - `tools/assets/textures/` (mới, chứa script sinh texture);
  - `public/world/textures/` (mới);
  - `assets/LICENSES.csv` (chỉ thêm dòng);
  - `src/features/world/terrain/*` (vật liệu và shader địa hình);
  - test liên quan.
- **Không sửa:** `index.ts`, `water/*`, `foliage/*`.
- **Hiện trạng:** mặt đất chỉ là màu đỉnh trên lưới 2 m, nên nhòe, phẳng, trông như nhựa (`docs/showcase/29-hoan-thien/ingame-8-khu.webp`).

### Việc

1. Viết script Node sinh texture:
   - 4 texture tileable 512²: cỏ/rêu, đất lối đi, đá, cát. Mỗi texture là chi tiết độ sáng, gần xám, xoay quanh 0,5;
   - thêm 1 normal map nhẹ dùng chung;
   - nén KTX2: ETC1S cho texture chi tiết, UASTC cho normal;
   - tổng dung lượng ≤ 600 KB.
2. Sửa shader địa hình:
   - giữ màu đỉnh làm màu gốc;
   - nhân thêm chi tiết theo mặt nạ suy từ màu và độ dốc: cỏ, đất lối đi, đá ở chỗ dốc (dùng triplanar), cát ven biển;
   - lặp ở 2 tỉ lệ (gần khoảng 1,5 m, xa khoảng 8 m) để không lộ lặp;
   - chi tiết mờ dần theo khoảng cách.
3. Texture tải khi vào world và tính vào ngân sách 8 MB. Ở mức Low thì tắt chi tiết, giữ shader cũ.

### Nghiệm thu

- Từ khoảng cách 5–15 m nhận ra được chất liệu cỏ, đất, đá, cát.
- Nhìn từ camera lúc chơi không lộ lưới lặp.
- Luma 8 khu lệch không quá ±0,03.
- Ở xa trong cảnh mở đầu và cảnh kết cũng không lộ lặp.

### Trả lại vòng 1

Xem `docs/tickets/_graphics-r1.md`.
