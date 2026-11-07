## TICKET B2-241: rừng xa trong cảnh mở đầu đọc như rừng, không như đồng cỏ

- Đọc `_review-common.md` (cổng 4191), `_dirA-common.md`, `docs/art-bible/` (taste §5.2: intro bay trên tán rừng).
- Được sửa: `src/features/world/scene/far-landscape.ts`, `src/features/world/foliage/*` (chỉ phần tán xa/impostor), test liên quan. Không sửa `index.ts`, `cinematic/*`.
- Hiện trạng: `docs/showcase/29-hoan-thien/hien-trang/intro-rung-thua.webp` (intro 4 s), `docs/showcase/29-hoan-thien/intro.webp`: ngoài dải cây dọc suối, cả thung lũng là mặt cỏ xanh trơn; nhìn từ trên cao như đồng cỏ có vài cây lẻ. Taste: bay trên **tán rừng** dày.
- Việc: vùng biome `forest-dawn` ngoài tầm cây stream hiện tán rừng xa (ví dụ instanced billboard/impostor tán, hoặc lớp tán thấp nhấp nhô trên far-landscape) đủ dày để đọc là rừng; chuyển tiếp mềm vào cây thật gần suối; không lộ mép tile. Ngân sách: tổng tam giác world và draw call không vượt trần hiện có (test cũ), thời gian tới playable không tăng quá 0,2 s (deferred build được).
- Test: unit tam giác/draw call; ảnh intro 1,5 / 4 / 7 / 10 s trước/sau; 8 khu luma không đổi quá ±0,03.
