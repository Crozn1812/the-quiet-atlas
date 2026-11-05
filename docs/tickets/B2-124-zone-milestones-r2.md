## TICKET B2-124 — vòng 2 Art Director (đợt 22)

- Nhánh `lane/B2-124`. Được sửa: `src/features/world/zones/milestones.ts`, `tests/unit/world/zones/milestones.test.ts`.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` exit 0. Không commit.

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


## Sửa dựng cảnh vòng 2 theo Art Director (đợt 22). Mỗi mục là 1 ticket; đọc kèm `_zone-common.md`

Quy tắc chung vòng 2:

- **Nét mực:** khoảng 10 % mỗi cảnh dùng tông mực đậm (`ink` #2B2A26, hoặc `ink` lerp `forestDeep` 0,3), ví dụ chân thân cây, mặt dưới mái, khe hộp thư. Mục đích: silhouette đọc được qua sương.
- **Điểm nhấn:** mỗi khu có 1–3 chấm `flower` #D9822B, mỗi chấm khoảng 0,1–0,15 m: hoa dại, nơ dây, đèn.
- Mọi test cũ của khu vẫn pass: ngân sách, hành lang, nước, palette, dispose. Interactable phải nhìn thấy được, không bị vật khác che từ phía đường.
- Xem kết quả bằng: `pnpm exec vite tools/styleframes` rồi mở `/zones.html?zone=<id>&view=front|side`. Không bắt buộc chụp ảnh; Lead sẽ chụp.


## Việc của ticket này

### B2-124 `milestones`: bỏ hẳn cảm giác nghĩa trang

- Thay bia tròn bằng **đá đứng tự nhiên, thô, không đều**: 6 khối cao 0,9–1,6 m, mặt vát lệch, nghiêng 3–8°, xếp lỏng chứ không vòng cung đều.
- **Đá giữa cao khoảng 2 m**, rộng hơn hẳn: đây là interactable.
- Đặt trên **gò thấp 0,8 m** dạng mesh gò mềm. Gò không được cao quá đường đi: phải nằm ngoài hành lang và dốc nhẹ.
- 2 "slot tương lai": đá thấp, mặt phẳng nhạt, đặt hơi tách ra.
- Dời cây thông ra **sau** cụm đá (xa đường), để không che đá khi nhìn từ đường.
