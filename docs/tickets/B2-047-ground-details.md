## TICKET B2-047: Chi tiết mặt đất: cụm cỏ và đá (instanced, theo ô)

- Trạng thái: Assigned → Codex, đợt 18, nhánh `lane/B2-047`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/world/foliage/scatter.ts`: rải cây tất định theo ô, `isFoliageExcluded`, `SHORE_MIN_HEIGHT`
  - `foliage/instances.ts`, `foliage/shapes.ts` (phong cách dựng)
  - `terrain/height.ts`
  - `PRESETS` trong `src/features/world/terrain` (mật độ theo quality)
  - Ảnh `docs/showcase/17-world-c/4-gameplay.webp`: mặt đất đang trống trơn
- Taste §5.2: cỏ mềm, có sương, vẫn chừa nhiều khoảng trống. Màu theo palette §5.3.

### Việc

Tạo file mới `src/features/world/foliage/ground.ts`:

1. **Hình dạng:**
   - `createGrassTuft(seed)`, 3 biến thể: chùm 5–9 lá dẹt, cong nhẹ, ≤ 40 tam giác/chùm. Vertex color tối ở gốc, sáng ở ngọn.
   - `createRock(seed)`, 2 biến thể: đá tròn dẹt low-poly, ≤ 60 tam giác.
2. **Rải** bằng `scatterGround(tile)`, tất định theo ô, seed khác với seed cây.
   - Cỏ dày gần bờ suối và ven đường, thưa trên đồi.
   - Cỏ không được nằm:
     - trên đường đi rộng 3 m;
     - dưới nước;
     - trên bãi cát (cao dưới 0,9 m).
   - Đá thưa, nhiều hơn ở bờ suối và khu Old Trail.
   - Giới hạn mỗi ô:

     | Quality | Cỏ | Đá |
     |---|---|---|
     | High | tối đa 600 | tối đa 40 |
     | Balanced | 0,6 × mức High | 0,6 × mức High |
     | Low | 0 | có (chỉ đá) |
3. **`createGroundDetails(capacity)`** trả về `{ group, setTiles(items), setQuality(q), dispose }`.
   - Mỗi biến thể là 1 `InstancedMesh`, tổng ≤ 5 draw call.
   - Vật liệu ramp dùng chung. Màu cỏ suy từ `WORLD_DIRECTION` (forestLight pha paper).
   - Không đổ bóng (`castShadow = false`), không có collider.
4. **Không sửa `scene/compose.ts`.** Lead sẽ nối. Bàn giao kèm đoạn mã nối.

### Được sửa

- `src/features/world/foliage/ground.ts`
- `tests/unit/world/ground.test.ts`

### Test

- Tất định.
- Không instance nào nằm trên đường đi, dưới nước hoặc trên cát.
- Số lượng đúng theo từng quality.
- Đúng ngân sách tam giác của mỗi biến thể.
- Tổng ≤ 5 draw call.
- `dispose` hoạt động.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
