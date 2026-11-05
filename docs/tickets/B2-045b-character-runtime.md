## TICKET B2-045b: Nhân vật trong world. Nạp GLB, trộn Idle/Walk/Run theo tốc độ

- Trạng thái: Assigned → Codex, đợt 18, nhánh `lane/B2-045b`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/world/index.ts`: hiện nhân vật là `CapsuleGeometry` màu cam, ở dòng `const player = new Mesh(...)`
  - `src/features/world/locomotion.ts`
  - `src/features/world/materials/ramp.ts` (vật liệu toon)
  - `docs/adr/0007*` (ngân sách)

### Việc

Tạo thư mục mới `src/features/world/character/`:

1. `loader.ts`: `loadCharacter(url)`.
   - Dùng `GLTFLoader` + `MeshoptDecoder` từ `three/examples/jsm`. Cả hai đã có sẵn trong three, **không thêm dependency**.
   - Trả về `{ root, mixer, actions: { idle, walk, run } }`.
   - Thay vật liệu PBR bằng `createRampMaterial(<màu của vật liệu gốc>)` để khớp chất tranh và giữ đúng màu đã duyệt.
   - Bật `castShadow`.
2. `animator.ts`: logic thuần cộng `AnimationMixer`, hàm `update(dt, speed, grounded)`.
   - Trọng số Idle/Walk/Run trộn mượt: speed 0 là idle, quanh tốc độ đi bộ là walk, từ tốc độ chạy trở lên là run.
   - `timeScale` của walk và run tỷ lệ với tốc độ để chân không trượt. Mỗi chu kỳ walk bước 0,7 m.
   - Reduced motion: vẫn đi bình thường, nhưng bỏ chuyển động thở khi idle.
   - Nhân vật quay về hướng di chuyển, xoay mượt, tối đa 540°/s.
3. `fallback.ts`: nếu nạp lỗi hoặc chưa có file thì trả về capsule hiện tại (màu cũ) để world không vỡ, và `console.warn` một lần.
4. **Không sửa `index.ts`.** Lead tự nối. Bàn giao kèm đoạn mã nối ≤ 20 dòng.

### Được sửa

- `src/features/world/character/**`
- `tests/unit/world/character.test.ts`

### Test

Dựng một GLTF giả ngay trong test (`SkinnedMesh` + 3 `AnimationClip` tạo bằng code), rồi kiểm:

- Trọng số đúng ở speed 0, ở tốc độ đi bộ và ở tốc độ chạy; tổng trọng số luôn bằng 1.
- `timeScale` tỷ lệ với tốc độ.
- Xoay mượt và không vượt giới hạn.
- Có fallback khi loader ném lỗi.
- Vật liệu được thay bằng ramp và giữ đúng màu.
- `dispose` giải phóng geometry, material và mixer.

### Điều kiện xong

- `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0.
- Module chỉ nằm trong chunk world.
- Không commit.
