## TICKET B2-044: Nguồn suối. Dải nước không còn bị cắt thẳng cạnh điểm xuất phát

- Trạng thái: Assigned → Codex, đợt 18, nhánh `lane/B2-044`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/world/water/ribbon.ts`: `mouthBlend` ở cửa biển là mẫu
  - `src/features/world/terrain/height.ts`
  - Ảnh lỗi `docs/showcase/17-world-c/4-gameplay.webp`: mép nước cắt thẳng, ở góc trái phía trên nhân vật
- Spec/taste: §2.1 (suối là trục); taste §5.2 (nước mềm, không có cạnh cứng)

### Việc

1. `ribbon.ts`:
   - Đoạn đầu (t < 0,03) **thu hẹp dần** về khoảng 0,6 m và **chìm dần** xuống dưới mặt đất. Hàng đầu thấp hơn `worldHeight` ít nhất 0,05 m, để mép đầu không còn là một cạnh ngang nhìn thấy được.
   - Nếu cần, có thể kéo dài nguồn ngược lên (t âm, theo tiếp tuyến). Giữ UV.y theo mét.
2. `height.ts`: thêm một **vũng nguồn** nhỏ quanh điểm nguồn để nước có chỗ "rỉ ra":
   - Bán kính 3–5 m, sâu 0,3–0,6 m, mép mềm.
   - Không ảnh hưởng đường đi: path cao hơn mặt nước ít nhất 0,4 m. Các test coast/path/zone hiện có vẫn phải pass.
   - Không chạm vùng spawn: `worldSpawn` cách nguồn ít nhất 4 m và vẫn đứng trên đất khô.
3. Không đổi `waterLevelAt` ở ngoài đoạn nguồn.

### Được sửa

- `src/features/world/water/ribbon.ts`
- `src/features/world/terrain/height.ts`
- `tests/unit/world/water.test.ts`
- `tests/unit/world/river-terrain.test.ts`
- Test mới `tests/unit/world/river-source.test.ts`

### Test bắt buộc

- Bề rộng tại t=0 ≤ 0,8 m và tăng đơn điệu tới t=0,03.
- Hàng đầu nằm dưới mặt đất.
- Mọi đỉnh ribbon có t > 0,03 giữ nguyên như trước: so với công thức cũ, sai số 1e-6.
- Vũng nguồn có điểm sâu hơn bờ ít nhất 0,3 m.
- Spawn khô, cao ít nhất 0,4 m.
- Test coast/path/zone cũ vẫn pass.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
