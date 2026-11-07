## TICKET B2-241: rừng xa trong cảnh mở đầu đọc như rừng, không như đồng cỏ

- Đọc `_review-common.md` (cổng 4191), `_dirA-common.md`, `docs/art-bible/` (taste §5.2: intro bay trên tán rừng).
- Được sửa: `src/features/world/scene/far-landscape.ts`, `src/features/world/foliage/*` (chỉ phần tán xa/impostor), test liên quan. Không sửa `index.ts`, `cinematic/*`.
- Hiện trạng: `docs/showcase/29-hoan-thien/hien-trang/intro-rung-thua.webp` (intro 4 s), `docs/showcase/29-hoan-thien/intro.webp`: ngoài dải cây dọc suối, cả thung lũng là mặt cỏ xanh trơn; nhìn từ trên cao như đồng cỏ có vài cây lẻ. Taste: bay trên **tán rừng** dày.
- Việc: vùng biome `forest-dawn` ngoài tầm cây stream hiện tán rừng xa (ví dụ instanced billboard/impostor tán, hoặc lớp tán thấp nhấp nhô trên far-landscape) đủ dày để đọc là rừng; chuyển tiếp mềm vào cây thật gần suối; không lộ mép tile. Ngân sách: tổng tam giác world và draw call không vượt trần hiện có (test cũ), thời gian tới playable không tăng quá 0,2 s (deferred build được).
- Test: unit tam giác/draw call; ảnh intro 1,5 / 4 / 7 / 10 s trước/sau; 8 khu luma không đổi quá ±0,03.

### Trả lại vòng 1 (Lead, render)

Ảnh: `docs/showcase/29-hoan-thien/lead-review-b2-241-r0.webp` (intro 1,5 / 4 / 7 / 10 s). Luma 8 khu giữ nguyên (tốt). Nhưng tán xa đọc là **gò đồi tròn mịn màu tối**, không phải tán cây; ở 7 s gò dựng thành **bức tường** cao hơn hàng cây thật cạnh suối, che tầm nhìn.

Yêu cầu:
1. Đọc được **từng tán**: các thùy 6–12 m, mép tán gợn (bóng/sáng theo nắng sớm từ trên), xen kẽ đậm–nhạt; không phải bề mặt liên tục mịn. Được dùng InstancedMesh impostor tán thấp đa giác (ví dụ 8–12 tam giác/tán, 1 draw call) nếu vẫn trong trần tam giác world hiện có (test) và tạo ở deferred build.
2. Độ cao tán xa ≤ chiều cao cây thật (≈ 12–18 m trên mặt đất), giảm dần về 0 trong 30 m quanh dải cây stream (không có tường).
3. Màu: tán cùng họ màu với cây thật gần suối (xanh lục/ngọc đậm nhạt), sáng hơn mặt cỏ khi nhìn từ trên.
4. Đo: thời gian tới playable (`pnpm test:perf load-budget`) không tăng quá 0,2 s; `cpu-compare.mjs` không tệ hơn main quá +10 ms/s; luma 8 khu ±0,03. Tự chụp intro 1,5/4/7/10 s bằng `moments` (xem `tools/review/` hoặc chép `ending-shots.mjs`, bỏ `__tqaSkipIntro`).
