## Quy tắc chung cho 8 ticket dựng khu (đợt 21, B2-101…B2-108)

Mục tiêu: mỗi khu thành một **địa điểm hoàn chỉnh, đọc được ngay** (spec §2.1), không còn khối tạm.

### Hợp đồng

- Hợp đồng: `src/features/world/zones/types.ts`, Lead chốt; **không sửa file này**.
- Mỗi ticket viết đúng 1 file `src/features/world/zones/<zone-id>.ts`, export `create<Zone>Scene: ZoneSceneFactory`.
- Test đặt ở `tests/unit/world/zones/<zone-id>.test.ts`.
- **Không sửa** `index.ts`, `compose.ts` hay file của khu khác. Lead sẽ nối 8 khu vào world.

### Đọc trước

- `docs/art-bible/taste.md` §5.2–5.4 và §5.8.
- Ảnh `docs/showcase/20-world-life/*.webp`: phong cách hiện tại.
- Phong cách dựng procedural trong `src/features/world/props/` và `foliage/shapes.ts`:
  - dựng tất định;
  - vertex color nhân;
  - `createPropMaterial` / `createRampMaterial`.

### Phong cách

- Tranh màu nước, low-poly vát mép hơi lệch, vật liệu nhám.
- Màu **chỉ từ `PALETTE`** (qua `paletteColor`/lerp). Cam hoặc đỏ son chỉ là chấm nhỏ.
- **Bối cảnh Việt Nam (Đà Lạt):** rừng thông, đồi cỏ, hàng rào gỗ, nhà cũ phủ dây leo, biển.
  - **Không** đình chùa, mái cong, chữ Hán.
  - Không chữ, không logo, không biển hiệu có chữ (chữ nằm ở HTML).
  - "Công nghệ hòa vào thiên nhiên" chỉ là gợi ý nhẹ.
- Nhiều khoảng trống: vài mảng lớn rõ ràng, không rải vụn.

### Ngân sách (test bắt buộc)

- Theo `ZONE_BUDGET`: ≤ 6 000 tam giác, ≤ 8 draw call, mọi vật trong bán kính 30 m.
- **Gộp geometry theo material** (`mergeGeometries`), không tạo hàng trăm mesh.

### Ràng buộc vị trí (test bắt buộc)

- Không vật cứng nào trong hành lang đường đi, tức `onPath()` hoặc |x| ≤ `PATH_CLEARANCE` quanh trục Z cục bộ.
- Không đặt vật dưới nước (`underWater()`).
- Chân vật đặt theo `heightAt()`.
- Collider là box đơn giản, nằm ngoài hành lang.
- `interactable` cách hành lang 2–6 m, để người chơi đứng trên đường hoặc mép đường vẫn bấm E được (phạm vi E là 2,5 m).

### Chuyển động

- `update()` chỉ cho chi tiết nhỏ (cánh quạt, đèn lắc, lá).
- Chuyển động chậm.
- `reducedMotion` thì đứng yên.

### Test tối thiểu

- Đúng ngân sách tam giác và draw call.
- Tất định.
- Không vật nào trong hành lang.
- Không dưới nước.
- Collider ngoài hành lang.
- `interactable` cách hành lang 2–6 m.
- Màu thuộc palette.
- Không có mesh tên chứa `text` hay `logo`.
- `update` với `reducedMotion` không đổi transform.
- `dispose` giải phóng geometry và material.

Trong test, dùng context giả: `heightAt` trả 0 hoặc dốc nhẹ; `onPath` = |x| ≤ 2,6; `underWater` tùy khu.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.

Bàn giao: danh sách file; số tam giác và draw call thực tế; vị trí interactable; nhãn EN/VI.
