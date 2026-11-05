## TICKET B2-048: Xe GD110 trong world, mesh procedural + hiển thị theo trạng thái xe

- Trạng thái: Assigned → Codex, đợt 19, nhánh `lane/B2-048`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/vehicle/model.ts` (B2-015: `VehicleState`, `vehiclePosition`, corridor)
  - `tools/assets/blender/gd110.py`: thiết kế **đã duyệt giữ hết, D-23**
  - Turnaround `docs/showcase/15-turnaround/` (gd110-*.webp)
  - `src/features/world/foliage/shapes.ts` (phong cách procedural)
  - `materials/ramp.ts`
- Lý do dùng procedural thay vì GLB:
  - Xe chỉ có 1 chiếc, nên dựng trực tiếp trong mã, giữ đúng tỷ lệ/màu của `gd110.py` ở mức low-poly.
  - Không tốn byte tải, không cần chạy Blender.

### Việc

Tạo thư mục mới `src/features/world/vehicle/`:

1. **`mesh.ts`**: `createGd110()` trả về `Group`, ≤ 3 000 tam giác, ≤ 4 draw call. Bám theo `gd110.py` về kích thước, màu và bố cục:
   - thân trắng, yên đen dài;
   - **ghi đông scrambler** vuốt cao có thanh giằng;
   - vành nan gợi bằng vài thanh, lốp đen;
   - gương tròn, đèn pha tròn, baga sau;
   - mũ half-face với kính tròng hổ phách;
   - tote treo ghi đông;
   - ống xả kim loại mờ.

   **Không chữ, không logo, không huy hiệu.** Màu lấy từ PALETTE hoặc đúng màu đã duyệt trong `gd110.py`. Bánh xe là node con riêng để quay.
2. **`view.ts`**: `createVehicleView()`, cập nhật `update(state, corridor, dt)`:
   - Đặt vị trí theo `vehiclePosition`, theo độ cao terrain (`surfaceHeight` được truyền vào dạng tham số).
   - Hướng xe theo tiếp tuyến corridor.
   - Nghiêng khi vào cua, tối đa 12°, mượt.
   - Bánh quay theo quãng đường (bán kính bánh thật của mesh).
   - Reduced motion: không nghiêng.
3. **Không nối `index.ts`.** Lead hoặc B2-042 nối.

### Được sửa

- `src/features/world/vehicle/**`
- `tests/unit/world/vehicle-view.test.ts`

### Test

- Ngân sách tam giác và draw call.
- Không có mesh tên chứa "logo"/"text".
- Kích thước bao khoảng 1,9 × 1,1 × 0,75 m (±15 %).
- Bánh quay đúng góc = quãng đường / bán kính.
- Nghiêng ≤ 12° và về 0 khi đi thẳng.
- Reduced motion không nghiêng.
- `dispose` hoạt động.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
