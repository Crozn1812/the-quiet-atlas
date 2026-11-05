## TICKET B2-046: Đạo cụ vẽ tay: biển chỉ đường và bàn làm việc (procedural)

- Trạng thái: Assigned → Codex, đợt 18, nhánh `lane/B2-046`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/world/foliage/shapes.ts` (B2-039a): cách dựng tất định, vertex color nhân
  - `src/features/world/materials/ramp.ts`
  - `src/features/world/art/direction.ts`
  - `index.ts`: biển và bàn hiện là khối hộp (`props`, `size`)
- Taste §5.2–5.4: gỗ mộc, mép hơi lệch, không bóng. Không chữ, không logo trên bảng; chữ là hint HTML.

### Việc

Tạo thư mục mới `src/features/world/props/`:

1. `shapes.ts`:
   - `createSignpostGeometry()`: cọc gỗ hơi nghiêng cộng tấm bảng hình mũi tên, mép vát lệch tất định, ≤ 220 tam giác.
   - `createDeskGeometry()`: bàn gỗ nhỏ 4 chân, trên mặt có vài cuốn sổ hoặc tờ giấy, ≤ 400 tam giác.
   - Thuộc tính `color` gần trắng (0,85–1) để tạo vân gỗ nhẹ.
2. `materials.ts`: `createPropMaterial(kind)`.
   - Ramp toon, bật `vertexColors`.
   - Màu suy từ PALETTE: gỗ = ink lerp dusk/paper; giấy = paper.
3. `index.ts` (của thư mục props): `createProp(kind: "signpost" | "desk")` trả về `Mesh` có `userData.kind`.
   - Bounding box gần với hộp cũ, để collider và tương tác không đổi:
     - bảng (gồm cọc): khoảng 1,2 × 1,6 × 0,2 m;
     - bàn: khoảng 1,4 × 0,8 × 0,7 m.
4. **Không sửa `src/features/world/index.ts`.** Lead sẽ thay hộp bằng prop.

### Được sửa

- `src/features/world/props/**`
- `tests/unit/world/props.test.ts`

### Test

- Đúng ngân sách tam giác.
- Tất định: dựng 2 lần cho kết quả giống nhau.
- Bounding box nằm trong ±20 % kích thước mục tiêu.
- Vertex color nằm trong [0,85, 1].
- Màu vật liệu chỉ lấy từ PALETTE, khớp công thức.
- `dispose` hoạt động.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
