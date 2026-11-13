## TICKET E2E-VH2 — chuyển trạng thái lên xe vượt 15 s khi máy tải nặng (flaky trên main)

- Lane / milestone: L3 World / gate A (CI chạy config mặc định SwiftShader).
- Bối cảnh: `tests/e2e/world-vehicle.spec.ts:45` ("brake to rest", "E while rolling") thỉnh thoảng timeout: `transitioning` vẫn true sau 15 s. Thấy trên nhánh First Light dressing (không có code xe) và GFX-P5; chạy lại thì pass. E2E-VH (`42b9662`) đã sửa phần test lấy mẫu; phần này là app. Hoạt cảnh lên xe dài `VEHICLE_TRANSITION_SECONDS`; nghi: transition tiến theo dt bị kẹp (`timestep.ts` tối đa 5 bước × 1/60 s, `index.ts` kẹp animation dt 0,1 s), nên khi FPS rất thấp (SwiftShader + tải) thời gian thực để xong transition kéo dài gấp nhiều lần.
- Việc:
  1. Đo trên main (build một lần): FPS và thời gian thực từ nhấn E tới `transitioning=false`, chạy 2 worker, kèm tải nền (ví dụ 2 lượt spec song song). Ghi bảng.
  2. Tìm chỗ transition phụ thuộc số frame. Sửa để transition **xong theo thời gian mô phỏng hợp lệ mà không kẹt** khi FPS thấp: ví dụ transition dùng dt chưa kẹp (giới hạn hợp lý, như 0,25 s/frame) vì nó chỉ là hoạt cảnh, không phải vật lý; hoặc kết thúc transition khi đã quá thời lượng thực. Không đổi cảm giác ở 60 FPS, không đổi physics.
  3. Unit test: transition kết thúc đúng ở 60 FPS và ở 2 FPS (dt lớn).
- Được sửa: `src/features/vehicle/**`, `src/features/world/vehicle/**` **trừ** `mesh.ts`, `src/features/world/timestep.ts` (nếu cần, có test), unit test tương ứng.
- Không được sửa: `src/features/world/character/**` và `vehicle/mesh.ts` (GFX-P5 đang sửa), `index.ts` (nếu bắt buộc: ≤ 3 dòng, ghi rõ trong bàn giao), test e2e, timeout, config Playwright.
- Xong: e2e `world-vehicle.spec.ts` config mặc định `--workers=2` 5/5 lượt PASS khi có tải nền (dán output), e2e world 43/43, gate PASS. Không commit.
