## TICKET QF-03 — Video dạo đầu phải hiện thế giới High đầy đủ, không phải bản thô

- **Lane / milestone:** L3 / playtest Duy 20/11.
- **Mục tiêu:** ở chế độ High, intro bay qua thế giới đã có đủ cây HR, đá, set piece, vách và far landscape giống lúc chơi, không còn cảnh trơn trụi.
  - Duy: "video vào dạo đầu cũng là video bản raw chưa sắc nét (chế độ high)". Trong ảnh Duy chụp, intro thấy một mặt đất phẳng xanh, cây low-poly tối màu và tàn tích thô.
- **Nguyên nhân đã thấy:** trong `src/features/world/index.ts` (khoảng dòng 145–168), `dressing.startDeferred(...)` chỉ chạy khi `container.dataset.worldIntro === "done"`, nghĩa là mọi visual tùy chọn đều được dựng **sau** intro.
  - Cần kiểm tra thêm: asset HR (foliage `hr-runtime`, setpiece-hr, far-landscape) có bị gate theo intro không.
- **Được sửa:**
  - `src/features/world/index.ts`: chỉ phần dressing/intro start
  - `src/features/world/cinematic/**`
  - `src/features/world/dressing.ts`
  - test liên quan (`tests/unit/world/*intro*`, `*dressing*`, `tests/e2e/world-intro.spec.ts`)
- **Không được sửa:** phần xe trong `index.ts` (ticket QF-02 đang sửa), lockfile, `docs/`, `public/`.
- **Yêu cầu:**
  1. Ở High, dựng xong phần dressing/HR mà intro sẽ nhìn thấy **trước khi** intro bắt đầu bay.
     - Màn giấy hiện tại (paper/letterbox) giữ trong lúc chờ.
     - Có trần thời gian, ví dụ 8 s; quá trần thì vẫn bay, phần còn lại tiếp tục dựng trong lúc bay.
  2. Ở Low, giữ hành vi hiện tại, ưu tiên khung chơi đầu tiên.
  3. Reduced motion, Skip và Esc vẫn đúng như hiện tại.
  4. Không tăng byte tải ban đầu trước Enter World. Không tải chunk 3D trước Enter World.
- **Điều kiện xong:**
  - `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` exit 0.
  - `E2E_PORT=<cổng riêng> pnpm exec playwright test tests/e2e/world-intro.spec.ts tests/e2e/world.spec.ts`, dán dòng tổng kết.
  - Chụp 3 khung intro ở High (đầu, giữa, cuối) trước và sau sửa, lưu vào `test-results/qf-03/`, ghi đường dẫn trong bàn giao.
- **Bàn giao:** file, output lệnh, thời gian chờ thêm trước intro (ms) đo trên máy, ảnh trước/sau.
