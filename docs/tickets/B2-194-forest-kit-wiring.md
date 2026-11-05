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

### Lead thử nối thẳng (2026-11-06, đã hoàn tác): 5 FAIL

- `foliage.test.ts` "two thirds bare": tỉ lệ thân trần ≈ 0 thay vì 2/3 — `createPineCrownV2` **không cùng gốc toạ độ** với `createPineCrown` (bản cũ đặt tán ở `height*2/3 − TRUNK_HEIGHT` qua `paintCrown`). Sửa V2 cho khớp, hoặc chuyển đổi khi nối.
- `foliage.test.ts` "before/after submitted triangles … 240 m": 872 791 > trần 789 083 (+25 %). V2 phải giảm tam giác (mục tiêu ≤ 700/biến thể) hoặc dùng LOD xa.
- `foliage.test.ts` "selects and fades real high pine crowns": crown fraction sai do lệch toạ độ ở trên.
- `foliage-light.test.ts`: đếm cứng tam giác thông cũ (132) → đổi sang đếm từ `createPineCrownV2`.
- `pine.test.ts` "reports the High streamed world's triangle budget … factory swap": cần xem lại sau khi nối.
- Phần đá ground: `createGroundDetails` gộp biến thể bằng thuộc tính `groundPosition1/2` nên mọi biến thể phải **cùng số đỉnh**; kit đá hiện không bảo đảm. Chỉ đổi nếu chuẩn hoá được số đỉnh, nếu không thì giữ `createRock` và ghi lý do.
