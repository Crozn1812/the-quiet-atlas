## Nhân rộng hướng R1 ra toàn world (Duy, 2026-11-09)

Mẫu chuẩn là First Light R1 + FL-02 (`docs/showcase/32-first-light-prototype/`, main `f7f8c27`). Hiện R1 chỉ có hiệu lực trong bán kính 48 m quanh First Light; ra ngoài vùng này world trở về kiểu cũ (cây tán khối mờ, mặt đất tối hơn), nên khi đi qua các khu thấy hai ngôn ngữ hình ảnh.

### Chung cho R1-A/B/C

- **Đọc:** `_common-b2.md`, `_graphics-common.md`, `_review-common.md`, README mẫu R1, các file R1 trong `src/features/world/` (grove, fog/vùng 48 m, camera thấp, nền đất xanh–cát).
- **Được sửa:**
  - `src/features/world/foliage/*`, `scene/*`, `terrain/*`, `sky/grade.ts`, `art/direction.ts`;
  - `src/features/world/zones/*` (chỉ phần dressing/landmark của khu trong ticket);
  - `src/features/world/index.ts` (chỉ khi cần nối);
  - test unit + e2e liên quan.
- **Mục tiêu:**
  - Một ngôn ngữ R1 thống nhất trên toàn tuyến: tán khối mặt phẳng nhiều cụm, thân có cành, lớp cây gần/giữa/xa, mặt đất sáng rõ, không khí trong.
  - Chuyển tiếp giữa các khu không có mép.
  - Giữ màu theo biome (rừng bình minh → đồi nắng muộn → biển hoàng hôn, theo `docs/art-bible/lighting.md`).
  - Camera chơi thấp như R1 ở mọi khu, nếu không làm hỏng e2e camera.
  - Thay cơ chế "vùng 48 m quanh First Light" bằng cấu hình toàn world hoặc theo từng biome. First Light giữ nguyên như mẫu.
- **Tự kiểm tra (bắt buộc):**
  - `pnpm build`, serve ở cổng riêng;
  - `TQA_QUALITY=high node tools/review/ingame-shots.mjs` đủ 8 khu, cộng ảnh góc thấp tại mỗi khu trong ticket;
  - `intro-shots.mjs`, `ending-shots.mjs`;
  - `luma.mjs` (không yêu cầu ±0,03 với khu chủ đích đổi, nhưng luma rừng phải từ 0,24 trở lên);
  - `cpu-compare.mjs` 2 cặp so với main: không quá main + 10 ms/s;
  - `pnpm test:perf load-budget`: vào chơi ≤ 6 s;
  - `pnpm exec playwright test --workers=2` các spec world.
  Dán bảng kết quả và đường dẫn ảnh.

### R1-A: rừng (Roots, Workshop, Milestones) + hành lang rừng giữa các khu
- Ngôn ngữ R1 phủ toàn biome `forest-dawn`. Landmark của từng khu (gốc cây Roots, nhà Workshop, cột mốc Milestones) đọc rõ giữa cây R1.
- Tán xa (B2-241) cùng ngôn ngữ R1, không còn khối mờ.

### R1-B: đồi (Old Trail, Horizon) (sau khi R1-A merge; chạy song song với R1-C)
- Đồi nắng muộn: cỏ sáng, cây R1 thưa hơn, có vài cây đơn lẻ làm điểm nhấn; sông đọc rõ.

### R1-C: biển (Quiet Shore, Last Postcard) (sau khi R1-A merge; chạy song song với R1-B)
- Bờ biển hoàng hôn: thảm cỏ ven biển, cây/bụi R1 chịu gió; vách, cát, đá theo ngôn ngữ khối của FL-02 (đá) và G-03.
- Giữ lan can RD-01, hộp thư, băng ghế bí mật, cảnh kết.
