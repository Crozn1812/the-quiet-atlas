## TICKET B2-126b: Horizon vòng 3. Tuabin rõ từ đường đi, kiểm trên ĐỊA HÌNH THẬT

- Nhánh `lane/B2-126b`
- Được sửa: `src/features/world/zones/horizon.ts`, `tests/unit/world/zones/horizon.test.ts`
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
- Đọc kèm `_zone-common.md` và mục B2-126 trong `docs/tickets/B2-12x-zone-fixes-r2.md`.

### Bài học từ vòng 2 (đã bị Lead bỏ)

- Bản vòng 2 tự xoay ngữ cảnh theo "phía biển" và đặt tuabin ở x = 24 m.
- Trên **mỏm thật** (B2-109), ống nhòm ở x = 4,65 rơi vào chỗ không hợp lệ, `siteFor` ném lỗi, và **cả world không mount được**.
- Test cũ chỉ dùng mặt phẳng giả nên không bắt được lỗi này.

### Việc

1. **Giữ cấu trúc vòng 1 hiện có** (đã chạy đúng trong world). Chỉ đổi những điểm sau:
   - 2–3 tuabin cao 12–15 m, nằm trong tầm nhìn từ đường. Ưu tiên phía mỏm thấp dần ra biển; nếu không có thì lùi vào trong đất.
   - Bỏ đĩa xanh 10 cạnh. Nếu muốn có gò thì dùng gò mép mềm.
   - Thêm chấm cam ở ống nhòm.
2. **Không vị trí nào được làm khu không dựng được:**
   - Thiếu chỗ cho tuabin thì bỏ bớt tuabin, không ném lỗi.
   - Ống nhòm (interactable) phải có ít nhất 6 ứng viên.
3. **Test bắt buộc mới, dựng trên địa hình thật:**
   - Gọi `placeZoneScenes(surfaceHeight)` (import từ `src/features/world/zones` và `scene/compose`).
   - Lấy khu Horizon, rồi kiểm:
     - dựng không lỗi;
     - có ≥ 2 tuabin;
     - interactable cách hành lang 2–6 m và khô;
     - tuabin nhìn thấy được: raycast từ điểm trên đường (anchor − 8 m theo hướng đi, cao 1,6 m) tới đỉnh tuabin không trúng mesh nào khác của khu.
   - Các test mặt phẳng cũ vẫn giữ.
