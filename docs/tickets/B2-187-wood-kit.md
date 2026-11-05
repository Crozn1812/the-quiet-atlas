## TICKET B2-187: bộ đồ gỗ (khúc gỗ, gốc cây, ván, cọc, hàng rào hoa leo)

- Được sửa: tạo `src/features/world/props/wood.ts`; test mới `tests/unit/world/wood.test.ts`.
- Đọc `_dirA-common.md`, `_asset-common.md`. Tham khảo cách tô màu `props/shapes.ts` (không sửa file đó).

### Việc

Export các hàm trả `BufferGeometry` có vertex color, tất định theo seed:

1. `createLogGeometry(seed)`: khúc gỗ đổ dài 2–4 m, thuôn, vài mấu cành gãy, mặt cắt hai đầu sáng màu gỗ (`sand` pha `dusk` rất ít) có vòng tuổi bằng vertex color; rêu trên mặt trên. ≤ 400 tam giác.
2. `createStumpGeometry(seed)`: gốc cây cụt có rễ loe, mặt cắt nham nhở. ≤ 300.
3. `createPlankGeometry(length, seed)`: tấm ván có vát mép, hơi cong vênh, thớ bằng sọc vertex color. ≤ 60.
4. `createPostGeometry(height, seed)`: cọc gỗ đẽo 6–8 cạnh, đầu vát. ≤ 80.
5. `createFenceSpanGeometry(seed, { flowers: boolean })`: 1 nhịp hàng rào gỗ kiểu nông thôn (2 cọc + 2–3 thanh ngang), không thẳng tắp; `flowers` thêm dây leo xanh và vài chấm hoa `flower` (taste §5.8). ≤ 600.
6. `createBenchGeometry(seed)`: ghế gỗ đơn giản có lưng tựa. ≤ 500.
- Gỗ: nâu xám ấm (`rock`/`rockDark` pha `dusk` ≤ 15 %), không vàng bóng.

### Test

- Tam giác từng hàm; bounding đúng cỡ (ghế cao tựa 0,8–1 m, cọc theo `height`).
- Có ≥ 2 sắc gỗ khác nhau trong vertex color (thớ); hoa chỉ khi `flowers`.
- Màu thuộc PALETTE (lerp); tất định.
