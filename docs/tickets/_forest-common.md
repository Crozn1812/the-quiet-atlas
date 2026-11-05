## Đợt 25b: rừng theo ảnh của Duy (hướng A "Tranh chân thật")

Duy (2026-11-05) nói: "Trong khu rừng thì đối với mình sẽ gần giống như này", kèm 3 ảnh. Ảnh không có trong repo; Lead mô tả lại bên dưới. **Không chép bố cục.**

### Ba ảnh tham chiếu

1. **Rừng già, ẩm, tối:**
   - thân cây lớn phủ rêu, mọc nghiêng;
   - cây cầu gỗ/tre có tay vịn bắc qua khe suối;
   - dương xỉ, đá phủ rêu;
   - sương xanh ở chiều sâu.
2. **Rừng mây xanh rêu:**
   - thân cây cao phủ rêu, có dây leo và dương xỉ bám trên thân;
   - lối mòn đất nhỏ uốn lượn;
   - sương dày phía sau, các lớp cây mờ dần theo chiều sâu.
3. **Rừng lá rộng xanh tươi:**
   - nắng lọt qua tán thành đốm sáng trên lối đất phủ lá khô cam nâu;
   - bụi cây thấp hai bên lối.

### Lead chốt

- **Rừng chuyển từ "rừng thông thưa" sang rừng núi lá rộng ẩm, kiểu rừng già vùng cao Việt Nam.**
  - Cây lá rộng thân phủ rêu chiếm đa số.
  - Thông chỉ còn ở rìa rừng giáp đồi cỏ (Đà Lạt).
  - Tầng dưới dày: dương xỉ, bụi.
  - Lối mòn đất nhỏ, có lá khô.
  - Có sương xanh ở chiều sâu, và nắng lọt thành đốm/vệt sáng.
- **Màu:**
  - lá: `forestLight`/`forestDeep`/`grass`;
  - rêu: `grass` pha `forestDeep`;
  - thân: `rockDark` pha `forestDeep`;
  - lá khô trên lối: `grassDry` pha `flower`, rất ít;
  - sương: `mist` pha `skyLow`. Không dùng màu kem giấy.

Quy tắc chung: theo `_dirA-common.md` (palette, không texture ảnh, ngân sách, tất định, quy ước vị trí, test thay mắt, điều kiện xong).
