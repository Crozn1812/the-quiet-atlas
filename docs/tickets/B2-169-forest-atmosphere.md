## TICKET B2-169: không khí rừng: sương xanh ở chiều sâu, vệt nắng xuyên tán

- **Giao sau khi B2-161 đã merge** (cùng nhóm file hậu kỳ/fog).
- Được sửa: `src/features/world/art/direction.ts` (tham số mist/fog theo biome), `src/features/world/scene/paper.ts`, `src/features/world/post/paper.ts`, `src/features/world/zones/first-light.ts` (vệt nắng), và test.
- Đọc `_forest-common.md` và `_dirA-common.md`.

### Việc

1. **Sương rừng** (biome `forest-dawn`):
   - Màu `mist` pha `skyLow`, hơi xanh lá. Không dùng màu kem.
   - Gần (< 25 m) gần như trong. Từ 40–120 m các lớp cây mờ dần rõ rệt, giống ảnh rừng mây.
   - Đồi và biển giữ độ trong của hướng A.
2. **Vệt nắng xuyên tán:**
   - Ở First Light và 2–3 chỗ trống dọc lối rừng, có vệt sáng xiên mềm (mesh trong suốt rẻ, đã có kiểu tương tự ở First Light).
   - Màu `sunGold` pha `cloud`, mờ. Chỉ thấy khi nhìn ngược nắng.
3. **Chuyển biome mượt:** rừng → đồi trong khoảng 40 m đường đi.

### Test

- Fog rừng ở 30 m ≤ 15 %, ở 100 m ≥ 45 %.
- Đồi ở 100 m ≤ 15 %.
- Màu sương gần `mist`/`skyLow` hơn `paper`.
- Số vệt sáng đúng; ≤ 1 draw call tăng thêm.
