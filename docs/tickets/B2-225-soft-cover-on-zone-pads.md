## TICKET B2-225: lớp phủ mềm được mọc trên nền khu (điểm xuất phát đang trống)

- Đọc `_finish-common.md`, `B2-223-spawn-undergrowth.md` (đã merge).
- Được sửa: `src/features/world/foliage/scatter.ts` (thêm hàm loại trừ **mềm** riêng cho lớp phủ nền), `src/features/world/foliage/ground.ts`, `src/features/world/foliage/grass-field.ts` (dùng hàm mềm), test liên quan. Không sửa logic đặt **cây** (`isFoliageExcluded` giữ nguyên cho cây).
- Ảnh trong game: `docs/showcase/27-hoan-thien-1/lead-review/ingame-spawn-after-223.webp` — sau B2-223 khung nhìn đầu **vẫn trống**, vì toàn bộ khung nằm trong nền khu First Light (bán kính 12 m + lề) và vòng 13 m quanh vệt nắng gần spawn, nơi `isFoliageExcluded` cấm mọi thứ.

### Việc

1. Thêm `isGroundCoverExcluded(x, z)`: chỉ loại trừ lối (hành lang hẹp hơn: `PATH_WIDTH / 2 + 0.3`), nước/bờ, cầu, vòng 2 m quanh spawn (`pathPointAt(0)`), và **chân các prop/collider của khu** (dùng bounds khu đang truyền vào compose — `zoneFoliageBounds` — hoặc collider box có sẵn; lề 0,4 m). **Không** loại trừ toàn bộ nền khu và vòng vệt nắng.
2. Lớp phủ mềm (túm cỏ, dương xỉ, hoa, lá khô, cỏ field) dùng hàm mềm; đá/khúc gỗ/bụi cao vẫn dùng hàm cũ.
3. Ngân sách: tam giác High tại spawn không quá +25 % so với sau B2-223; thời gian vào chơi không tăng quá 0,2 s (Lead đo).

### Test

- Trong 3–12 m quanh spawn (ngoài lối, ngoài chân prop): ô 4 × 4 m có ≥ 6 vật phủ mềm.
- Không vật phủ nào trong 2 m quanh spawn, trên lối, dưới nước, trong chân collider khu.
- Test cũ pass.
