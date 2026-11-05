## TICKET B2-171: bỏ vằn đường đồng mức trên sườn; nền rừng màu rêu tối

- Được sửa: `src/features/world/materials/ramp.ts`, `src/features/world/terrain/mesh.ts` (**chỉ** thêm màu nền rừng; giữ quy tắc cát/đá/nước hiện có) và test của hai file.
- Đọc `_dirA-common.md` và `_forest-common.md`.

### Lead thấy trên ảnh

- Sườn đồi trơn có **các vằn tối chạy theo đường đồng mức**. Nguyên nhân là các bậc của shading ramp (toon) áp lên mặt cong. Rõ nhất ở Workshop góc rộng.
- Nền rừng cũng màu cỏ đồng như ngoài đồi, chưa có cảm giác rừng ẩm.

### Việc

1. **Ramp địa hình:**
   - Chuyển sáng tối liên tục, mềm (half-Lambert hoặc ramp nội suy).
   - Không còn ranh giới bậc thấy được trên mặt cong.
   - Vật thể (props, cây) giữ ramp mềm 4 bậc như hiện tại.
   - Bóng đổ vẫn rõ.
2. **Nền rừng** (biome `forest-dawn`, ngoài lối):
   - Pha `forestDeep` + `grass` với một chút `rockDark`: tối và ẩm hơn đồi.
   - Có noise mảng rêu.
   - Chuyển mềm sang đồi trong 40 m.

### Test

- Trên một sườn cong lấy mẫu dày, độ chênh luma giữa hai mẫu kề nhau ≤ 0,03, không có bước nhảy.
- Màu nền rừng tối hơn màu đồi, với luma thấp hơn ≥ 0,05.
- Các test cát/đá/nước hiện có pass.
