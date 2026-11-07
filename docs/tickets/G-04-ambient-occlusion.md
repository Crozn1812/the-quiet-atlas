## TICKET G-04: AO màn hình + bóng mềm (mẫu vòng duyệt gu)

- **Đọc:** `_graphics-common.md` (cổng 4304), `docs/art-bible/lighting.md`, `shading.md`.
- **Được sửa:**
  - `src/features/world/post/*`;
  - `src/features/world/scene/paper.ts` (chèn pass);
  - phần bóng đổ trong `src/features/world/scene/compose.ts`;
  - test liên quan.
- **Không sửa:** `terrain/*`, `foliage/*`, `water/*`.
- **Hiện trạng:** vật thể trông "nổi" trên mặt đất; chân cây, chân đá, chân nhà không tối đi; bóng cứng và răng cưa.

### Việc

1. Thêm AO màn hình nhẹ, kiểu SAO, GTAO hoặc N8AO.
   - Ưu tiên tự viết, không thêm dependency. Nếu buộc phải thêm, ghi rõ lý do để Lead duyệt lockfile.
   - Chạy ở nửa độ phân giải, bán kính khoảng 1 m.
   - Chỉ làm tối, không đổi màu.
   - Theo mức chất lượng: High bật; Balanced nửa độ phân giải; Low tắt.
2. Làm bóng nắng mềm hơn (PCF mềm hoặc VSM), trong ngân sách hiện có.

### Nghiệm thu

- Ảnh trước/sau: 8 khu và ảnh cận chân cây, chân nhà.
- Kết quả `cpu-compare.mjs`.
- Thời gian khung GPU ở High và Balanced trên máy dev. Ghi rõ số này chỉ để tham khảo; T08/T09 trên Iris Xe vẫn NOT RUN.

### Trả lại vòng 1

Xem `docs/tickets/_graphics-r1.md`.
