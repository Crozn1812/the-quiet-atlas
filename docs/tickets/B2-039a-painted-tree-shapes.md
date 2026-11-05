## TICKET B2-039a: Dáng cây vẽ tay (procedural), nhiều biến thể, hướng C

- Trạng thái: Assigned → Codex, đợt 17, nhánh `lane/B2-039a`
- Đọc trước:
  - `docs/tickets/_common-b2.md`
  - `docs/art-bible/taste.md` §5.2–5.4
  - `docs/adr/0013-*.md` (phần bổ sung 2026-11-05: hướng C)
  - `src/features/world/foliage/instances.ts`: hiện có `createPineCrown` 3 tầng, `createBroadleafCrown` 4 cụm, thân trụ 6 cạnh
  - ảnh hiện trạng: `docs/showcase/16-styleframes/C-forest-dawn.webp`
- **Lý do chọn procedural thay vì glTF:** cây được instancing hàng nghìn cây, không cần tải mạng thêm (giữ ngân sách §8), màu do material ramp quyết định.
- Vấn đề Art Director nêu:
  - Tán quá đều, giống khối hình học (nón trơn, cạnh thẳng).
  - Thân cây dài, trơn, giống cột.
  - Mọi cây giống hệt nhau.

### Việc (`src/features/world/foliage/`)

1. File mới `shapes.ts`:
   - Ít nhất **3 biến thể thông** và **2 biến thể cây lá rộng**, dựng tất định theo seed (không `Math.random`).
   - Thông:
     - 3–5 tầng.
     - Mép tầng lệch nhẹ: bán kính nhiễu ±12 % theo góc.
     - Đỉnh hơi nghiêng.
     - Tầng dưới rộng và rủ xuống một chút.
   - Cây lá rộng: 4–7 cụm, kích thước khác nhau, đặt lệch tâm, tán dẹt hơn cao.
   - Mỗi biến thể **≤ 300 tam giác** (tán + thân).
   - Thuộc tính `color` cho từng vertex: gần trắng (0,82–1) và **sáng dần từ gốc tán lên ngọn**, theo kiểu lớp màu nước. Màu vật liệu vẫn quyết định sắc độ, nên vertex color chỉ là hệ số nhân.
   - Thân cây:
     - Thuôn: gốc to hơn ngọn.
     - Phần thân lộ ra ngắn hơn hiện tại khoảng 30 %: tán bắt đầu thấp hơn.
     - **Collider giữ nguyên** (`colliders.ts` không sửa).
2. `instances.ts`:
   - Mỗi biến thể có một `InstancedMesh` riêng.
   - Chọn biến thể theo hash tất định của (x, z) cây.
   - **Giữ API công khai:**
     - `createFoliage(maxPerKind)` trả về `{ group, species, setTiles, setQuality, dispose }`.
     - `species.pine.crowns.material` và `species.broadleaf.crowns.material` (cùng `trunks.material`) vẫn tồn tại.
     - **Mọi biến thể cùng loại dùng chung một material** (tô màu preset chỉ cần đổi một chỗ).
     - Có thể thêm trường `variants`.
   - Bật `vertexColors` trên material tán.
   - Số draw call: tăng tối đa (số biến thể − 2) × 2 so với hiện tại. Ghi con số cụ thể trong bàn giao.
3. Giữ nguyên các hàm `createPineCrown` / `createBroadleafCrown` (dạng export, dùng làm biến thể đầu tiên), hoặc thay thế đúng chỗ và cập nhật test.

### Được sửa

- `src/features/world/foliage/shapes.ts` (mới)
- `src/features/world/foliage/instances.ts`
- `tests/unit/world/foliage.test.ts`
- `tests/unit/world/foliage-shapes.test.ts` (mới)

### Test bắt buộc

- Mỗi biến thể ≤ 300 tam giác.
- Có ít nhất 3 biến thể thông và 2 biến thể lá rộng.
- Gọi dựng 2 lần với cùng seed cho ra vị trí giống hệt (tất định).
- Vertex color của tán nằm trong [0,82, 1] và tăng theo chiều cao (trung bình nửa trên > nửa dưới).
- Cùng loại cây thì dùng chung một material.
- Tổng số instance bằng số cây đầu vào ở mọi quality.
- Phân bố biến thể: mỗi biến thể chiếm ≥ 10 % trên 2000 cây.
- Bounding box tán của mỗi biến thể cao 3–5,5 m, rộng ≤ 4,4 m (không đè lối đi).

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0; dán dòng tổng kết. Không commit.
