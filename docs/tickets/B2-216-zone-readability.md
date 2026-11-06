## TICKET B2-216: prop trong khu đọc rõ (hết khối đen)

- Đọc `_finish-common.md`, `_zone-r4-common.md`. Được sửa: `src/features/world/props/materials.ts` (hoặc nơi tạo material prop dùng chung) và test liên quan. Không sửa file khu.

### Vấn đề

- Ảnh `docs/showcase/26-asset-ky/05-workshop.webp`: chái gỗ Workshop thành **khối đen**; nhiều prop gỗ trong khu rừng tối gần như đen, mất hình khối.

### Việc

1. Material prop: sàn sáng tối thiểu theo albedo (luma cuối ≥ 0,08 trong bóng rừng bình minh), bóng ngả xanh/tím (taste §5.4), không đen.
2. **Viền sáng cạnh** (rim) nhẹ phía bầu trời (Fresnel × hemi sky, ≤ 15 %) để tách vật khỏi nền tối.
3. Không thêm pass/draw call.

### Test

- CPU mô phỏng shader: gỗ (`rock`/`rockDark` pha `dusk`) trong bóng ở t = 0,15 và 0,93 có luma ≥ 0,08; mặt thuận sáng không sáng hơn bản cũ quá 10 %.
- Test khu/prop cũ pass (cập nhật chuỗi shader nếu test so chuỗi).
