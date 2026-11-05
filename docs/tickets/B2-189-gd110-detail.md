## TICKET B2-189: xe GD110 làm kỹ (theo ảnh thật của Duy)

- Được sửa: `src/features/world/vehicle/mesh.ts`, test `tests/unit/world/*vehicle*`.
- Không sửa `vehicle/view.ts`, `zones/quiet-shore.ts`. Giữ các export (`GD110_SCALE`, `GD110_WHEEL_RADIUS`, `GD110_WHEELBASE`, `GD110_COLORS`, hàm tạo) và kích thước bao (±5 %).
- Đọc `_dirA-common.md`, `_asset-common.md`, `docs/art-bible/taste.md` §5.7, ADR 0013 (ghi đông **scrambler**, Q-25).

### Việc

1. **Bánh nan:** vành mỏng, 18–24 nan mảnh (có thể gộp thành dải tam giác), lốp đen dày có gờ; moay-ơ có trống phanh.
2. **Thân:** bình xăng giọt nước trắng (`paper`) có đường gờ, yên đen dài phẳng có viền, ốp sườn, đèn pha tròn có viền mờ ấm, gương tròn trên cần mảnh, ghi đông scrambler cao có thanh ngang.
3. **Cơ khí:** khối máy có cánh tản nhiệt (rãnh), ống xả uốn chạy ngược lên có tấm che nhiệt, xích, phuộc trước có ống bọc, hai giảm xóc sau có lò xo (vòng), chắn bùn trước/sau, baga sau dạng ống.
4. **Phụ kiện** (taste §5.7): mũ bảo hiểm cổ điển có kính phi công đặt trên bình, túi tote kem treo ghi đông.
5. Kim loại: mờ, ấm (`#C0B8A6` đã duyệt), không bóng. **Không chữ, không huy hiệu.**
6. Giữ 1 draw call (batch vertex color hiện có); ≤ 8 000 tam giác.

### Test

- Tam giác ≤ 8 000; số nan mỗi bánh 18–24; bounding ±5 % bản cũ; vẫn 1 draw call.
- Có đủ các phần theo tên trong batch (`parts`): wheel, spoke, tank, seat, headlight, mirror, handlebar, engine, exhaust, chain, fork, shock, fender, rack, helmet, tote.
- Màu thuộc bảng màu đã duyệt; test cũ pass.
