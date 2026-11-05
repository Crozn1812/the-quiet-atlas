## TICKET B2-194: nối thông v2 và bộ đá mới vào rừng

- Được sửa: `src/features/world/foliage/instances.ts` (**chỉ** chỗ tạo crown thông), `src/features/world/foliage/ground.ts` (**chỉ** `createRock` → dùng kit), test foliage/ground liên quan (cập nhật fingerprint/đếm tam giác và ghi lý do).
- Đọc `_dirA-common.md`, `_asset-common.md`.

### Việc

1. `instances.ts`: crown thông dùng `createPineCrownV2(seed)` từ `foliage/pine.ts` thay `createPineCrown(seed)`. Giữ export cũ `createPineCrown` (các khu còn dùng). Kiểm shader `surface`, translucency (B2-183), wind vẫn đúng với geometry mới; tổng tam giác High không tăng quá 25 %.
2. `ground.ts`: `createRock(seed)` trả geometry từ `createRockGeometry("stone", seed, …)` của `props/rocks.ts` (mossy trong rừng nếu API có), giữ cỡ tương đương và giữ `ROCK_VARIANT_SEEDS`; ≥ 2 biến thể khác nhau thật sự.
3. Không đổi vị trí scatter, collider.

### Test

- Crown thông trong `createFoliage` có cùng số tam giác như `createPineCrownV2` từng seed.
- Đá ground: tam giác ≤ 200, 2 biến thể khác hash.
- Attribute-budget, foliage-light, foliage-natural, ground test pass.
