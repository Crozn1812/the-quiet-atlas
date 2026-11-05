## TICKET B2-166: cây rừng lá rộng phủ rêu, dây leo

- Được sửa: `src/features/world/foliage/shapes.ts`, `src/features/world/foliage/instances.ts`, cùng test của chúng (`foliage-shapes`, `foliage`).
- Không sửa: `scatter.ts`. Vị trí cây giữ nguyên; chỉ đổi hình dạng, biến thể và màu.
- Đọc `_forest-common.md` và `_dirA-common.md`.

### Việc

1. **Cây lá rộng già** (loại `broadleaf` trong biome rừng):
   - thân cao, hơi cong/nghiêng, gốc loe;
   - 2–3 cành chính;
   - tán thành nhiều cụm lớp lớp, không phải một khối tròn.
   - Có **≥ 3 biến thể hình**, chọn tất định theo vị trí.
2. **Rêu trên thân:** vertex color pha `grass` + `forestDeep`, đậm ở mặt hướng lên/hướng ẩm và ở gốc. Không dùng texture.
3. **Dây leo/dương xỉ bám thân:** vài dải low-poly rủ xuống từ cành, ở khoảng 40 % cây. Phải nằm trong cùng mesh/instance (không thêm draw call).
4. **Thông:** giữ, nhưng hình thật hơn: tầng cành rõ, ngọn nhọn. Phần tán vẫn màu như hiện tại.
5. **Bóng đổ:** tán có khe hở để bóng nắng lọt thành đốm (`castShadow` sẵn có). Không thêm light.
6. **Ngân sách:**
   - Mỗi cây LOD gần ≤ 600 tam giác.
   - Tổng draw call của foliage không tăng.
   - Ghi số tam giác trước và sau của vùng 240 m.

### Test

- Có ≥ 3 biến thể lá rộng; chọn tất định theo vị trí.
- Thân có vertex color rêu: luma vùng gốc thấp hơn vùng ngọn.
- Ngân sách tam giác mỗi cây.
- Draw call không đổi.
- Collider thân vẫn khớp với `TRUNK_HEIGHT`/bán kính hiện có.
