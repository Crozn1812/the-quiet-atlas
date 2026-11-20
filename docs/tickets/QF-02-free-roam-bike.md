## TICKET QF-02 — Xe GD110 lái tự do khắp bản đồ, qua được cầu

- **Lane / milestone:** L3 / playtest Duy 20/11 (ADR 0020 mục 1–2). **Đọc ADR 0020 trước.**
- **Mục tiêu:** lên xe ở First Light rồi lái tới mọi khu, chạy qua mọi cầu tới bãi biển cuối, không bị tường vô hình.
  - Duy báo: "từng khu vực như có bức tường vô hình chặn chiếc xe chạy qua, phải lách vào 1 khe nào đó mới đi qua được… chiếc xe không thể chạy qua cầu hay đi hết toàn bộ map".
  - Nguyên nhân: `src/features/vehicle/model.ts` chạy theo spline với toạ độ `(s, lateral)`, và độ lệch ngang bị kẹp. Xem `index.ts` quanh dòng 327 (`corridor`) và các dòng 690–760 (bước xe).
- **Được sửa:**
  - `src/features/vehicle/**`
  - `src/features/world/vehicle/**`
  - `src/features/world/index.ts`: chỉ phần xe (corridor, bước xe, dismount, cruise, parked bike)
  - `tests/unit/vehicle/**`, `tests/unit/world/vehicle-*.test.ts`, `tests/e2e/world-vehicle.spec.ts`
- **Không được sửa:** lockfile, `package.json`, `docs/`, `public/`, file ngoài danh sách trên.
- **Yêu cầu:**
  1. **Trạng thái xe** chuyển sang dạng tự do: `x, z, heading, speed`, cộng `mode` và `cruise`.
     - W tăng tốc, S phanh rồi lùi, A/D bẻ lái.
     - Tốc độ quay tỉ lệ với tốc độ xe và có giới hạn; xe đứng yên thì không quay tại chỗ.
     - Giữ các giới hạn trong `VEHICLE_LIMITS`: tốc độ tối đa, gia tốc, phanh, cruise.
  2. **Va chạm** dùng chung collider/raycast hiện có (Rapier hoặc mesh backend).
     - Xe dừng hoặc trượt dọc vật cản thật, không xuyên qua.
     - Không còn kẹp ngang theo spline.
     - Xe leo được dốc cầu và lối đi; không lao xuống nước sâu (coi nước sâu là chặn, đúng như nhân vật đi bộ).
     - Có biên thế giới.
  3. **Cruise:** giữ tốc độ cruise theo hướng xe đang chạy; đi chậm rồi dừng trước vật cản (`obstacleAhead` như cũ). Esc, C, mở UI, blur hay phanh đều hủy cruise ngay.
  4. **Xuống xe (E):** giữ kiểm tra chỗ đứng an toàn. Nhân vật xuống cạnh xe, xe đứng chân chống tại chỗ.
  5. **Xe đỗ ban đầu:** giữ vị trí hiện tại ở First Light (corridor s=6, lateral=-2), đổi sang toạ độ tuyệt đối.
  6. **Camera** khi lái: bám sau xe theo heading như hiện tại.
- **Điều kiện xong:**
  - `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` exit 0.
  - **e2e mới** trong `tests/e2e/world-vehicle.spec.ts`: lên xe ở First Light, giữ W và lái theo các điểm dọc lối đi (dùng hook test sẵn có để đọc vị trí) qua ít nhất một cầu, tới được khu sau cầu. Thêm một ca rẽ hẳn ra khỏi lối đi 5 m mà không bị chặn.
  - Các e2e xe cũ sửa lại cho đúng mô hình mới, giữ ý nghĩa: E khi đang lên xe, xuống xe đứng thẳng cạnh xe, cruise hủy.
  - Chạy `E2E_PORT=<cổng riêng> pnpm exec playwright test tests/e2e/world-vehicle.spec.ts tests/e2e/world-input.spec.ts` và dán dòng tổng kết.
- **Bàn giao:** file, output lệnh, cảm giác lái (tốc độ quay, bán kính), giới hạn còn lại.
