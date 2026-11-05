## TICKET B2-188: mây cumulus rõ khối (hết mảng mờ nhoè)

- Được sửa: `src/features/world/sky/dome.ts` (**chỉ** phần mây trong shader và uniform mây), test `tests/unit/world/sky*.test.ts`.
- Không sửa `sky/grade.ts`. Đọc `_dirA-common.md`, `_asset-common.md`.

### Lead thấy trên ảnh `01-duong-ven-bien.webp`

- Mây là các mảng nhoè lớn che gần nửa trời, mép mềm như bị blur, không có khối. Nhìn như vết bẩn.

### Việc

1. Mây cumulus có **khối**: đỉnh tròn sáng (phía mặt trời nhận `sunColor`), đáy phẳng hơn và tối hơn (`cloudBase`), mép rõ hơn hiện tại (vùng chuyển mép ≤ 1/4 hiện tại) nhưng vẫn mềm kiểu tranh.
2. Độ phủ: 25–40 % bầu trời phía trên chân trời; gần chân trời mây dẹt và nhỏ dần (phối cảnh).
3. Bình minh rừng: mây xám hồng, viền sáng ấm phía mặt trời. Hoàng hôn biển: đáy mây hồng cam, đỉnh tím xám.
4. Trôi rất chậm (giữ `cloudTime`); `reducedMotion` đứng yên. Không thêm texture, render target hay pass.

### Test (CPU mô phỏng hàm mây)

- Tỉ lệ phủ trên lưới mẫu nửa trên bầu trời: 0,25–0,40.
- Độ dốc mép: khoảng cách 10 %→90 % mật độ ngắn hơn bản cũ ≥ 3 lần.
- Đỉnh mây sáng hơn đáy ≥ 15 % luma ở cả t = 0,15 và t = 0,93.
- Test sky cũ pass (đổi kỳ vọng thì ghi lý do).
