## TICKET B2-191: thông Đà Lạt v2 (tán tầng có cụm kim, thân vỏ nứt)

- Được sửa: tạo `src/features/world/foliage/pine.ts` export `createPineCrownV2(seed)` và test `tests/unit/world/pine.test.ts`.
- **Không** sửa `foliage/shapes.ts` (B2-182 đang sửa) hay `instances.ts`. Lead sẽ đổi `createPineCrown` sang V2 khi merge. Đọc `createPineCrown` và `paintCrown` trong `shapes.ts` để giữ cùng hệ toạ độ, chiều cao (`pineHeight`), `TRUNK_HEIGHT`, thuộc tính `surface` (0 lá, 1 gỗ) và vertex color — kết quả phải thay thế trực tiếp được.
- Đọc `_dirA-common.md`, `_asset-common.md`.

### Việc

1. Thông ba lá Đà Lạt: thân cao thẳng, 2/3 dưới trần; tán thưa ở ngọn gồm 5–8 **tầng cành nằm ngang hơi rủ**, mỗi tầng là vài chùm kim (cụm dẹt) ở đầu cành, có khoảng trời lọt giữa các tầng. Không còn dạng nón giáng sinh.
2. Thân: nâu đỏ xám (`rockDark` pha `dusk` ≤ 15 %), vỏ nứt bằng vertex color sọc dọc, vài cành khô gãy ở phần thân trần.
3. 3 biến thể (`PINE_VARIANT_SEEDS`), ≤ 1 200 tam giác mỗi biến thể.

### Test

- Tam giác ≤ 1 200; chiều cao bounding khớp bản cũ ±5 %; số tầng 5–8.
- Có thuộc tính `surface` với 0 và 1, đỉnh gỗ ở 2/3 dưới.
- Màu thuộc PALETTE; tất định.
