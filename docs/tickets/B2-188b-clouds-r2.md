## TICKET B2-188b: mây vòng 2 (hết hàng bong bóng lặp)

- Được sửa: `src/features/world/sky/dome.ts` (phần mây), `tests/unit/world/sky.test.ts`.
- Đọc `B2-188-painted-clouds.md` (đã merge), `_dirA-common.md`, `_asset-common.md`.
- Ảnh: `docs/showcase/26-asset-ky/lead-review/01-r1-rung.webp`, `02-r1-bien.webp`.

### Lead thấy (test PASS nhưng hình hỏng)

- Mây thành **một hàng bong bóng giống hệt nhau, cách đều** (một dải trên cao, một dải ngang chân trời), đỉnh tròn hoàn hảo, đáy cắt thẳng — như hình dán hoạt hình. Đây là kiểu "dễ thương, lòe loẹt" Duy ghét (taste §5.1).
- Hàng trên cùng treo ngược như rèm.

### Việc

1. Mây **không lặp đều**: vị trí, cỡ, độ cao mỗi đám từ noise 2D nhiều tầng (domain warp), không theo chu kỳ góc phương vị nhìn thấy được. Đám to nhỏ khác nhau 3–5 lần.
2. Mỗi đám là tổ hợp nhiều "múi" có cỡ khác nhau, mép trên răng cưa mềm; đáy hơi phẳng nhưng **lượn**, không cắt thẳng.
3. Phối cảnh: gần đỉnh đầu mây to và thưa, gần chân trời mây dẹt, nhỏ, dày hơn, mờ dần vào mù chân trời.
4. Không có dải mây nào "treo ngược" ở đỉnh khung hình; mây gần zenith phải là đám tròn nhìn từ dưới (mờ hơn, đáy tối).
5. Giữ màu/ánh sáng của B2-188 (đỉnh sáng phía mặt trời, đáy hồng cam lúc hoàng hôn), độ phủ 25–40 %.

### Test

- Tự tương quan theo phương vị của mật độ mây ở độ cao 15° không có đỉnh > 0,5 tại bất kỳ chu kỳ 10°–90° (không lặp đều).
- Phân bố cỡ đám (đo bằng đếm vùng liên thông trên lưới 360 × 90): tỉ lệ đám lớn nhất/nhỏ nhất ≥ 3.
- Không có vùng liên thông nào chạy ngang > 120° phương vị.
- Test sky cũ pass.
