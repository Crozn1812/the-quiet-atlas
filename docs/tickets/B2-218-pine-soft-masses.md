## TICKET B2-218: tầng kim thông mềm như tán lá (hết "đĩa xếp chồng")

- Đọc `_finish-common.md`, `B2-191b-pine-needles.md`, `B2-213-leaf-cards.md` (shader mép lá đã có).
- Được sửa: `src/features/world/foliage/instances.ts` (**chỉ** để áp shader mép lởm chởm/biến sáng của B2-213 cho phần kim thông, `surface = 0` trên crown thông), test foliage.

### Vấn đề (ảnh `docs/showcase/27-hoan-thien-1/03-doi-co.webp`)

- Thông Đà Lạt đọc thành **các đĩa dẹt xếp chồng** mép tròn trơn, như bánh kếp. Kim thông thật có mép xơ, sáng tối lốm đốm.

### Việc

1. Bật cùng logic `discard` mép + biến sáng trong cụm của B2-213 cho kim thông, tần số cao hơn (kim mảnh hơn lá: 10–16/m mép, 25–35/m trong).
2. Mặt dưới tầng kim tối hơn mặt trên ≥ 15 % luma.
3. Không thêm draw call/attribute.

### Test

- Mô phỏng CPU như B2-213: tỉ lệ discard ở mép 30–60 %; độ lệch chuẩn luma trong tầng 0,04–0,12.
- Test foliage/attribute-budget pass.
