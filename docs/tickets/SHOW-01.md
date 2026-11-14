## TICKET SHOW-01 — Bộ showcase cuối cho Duy chấm đồ họa hướng C

- Lane / milestone: L4 QA / Definition of Done "Duy chấm một lần khi đồ họa hoàn thành".
- Mục tiêu: **một lệnh** tạo `docs/showcase/39-final/` từ một bản build `out/` đã có, để Lead chạy sau khi khu cuối merge.
- Việc:
  1. Script `tools/review/final-showcase.mjs <out-dir> <dest>`: tự mở server tĩnh (`tools/serve-out`), dùng lại `ingame-shots.mjs`, `intro-shots.mjs`, `ending-shots.mjs`, `luma.mjs` (gọi hoặc import, không chép lại logic). Xuất:
     - 8 khu × High 3 góc (góc chuẩn của `ingame-shots` + 2 góc lệch) WebP chất lượng 82, 1600×900;
     - 8 khu × Low 1 góc;
     - cận nhân vật 3 góc + xe 3 góc (High);
     - video intro và ending 30–60 s (WebM, ≤ 8 MB mỗi file; nếu không ghi được thì 12 khung mỗi đoạn);
     - `sheet-high.webp` (lưới 8 khu), `sheet-low.webp`;
     - `metrics.json`: luma từng khu, số request asset, byte tải, lỗi console.
  2. `docs/showcase/39-final/checklist.md` (mẫu, script điền số): mỗi khu 1 dòng "giữ / sửa / bỏ" + ô ghi chú, thêm dòng intro, ending, nhân vật, xe, nước, cây, ánh sáng. Viết tiếng Việt.
  3. Chạy thử một lần trên main hiện tại (build **một lần**, lệnh WASM ở `docs/runbook/codex.md`) ra `tmp/show-01/` (không phải docs/) để chứng minh script chạy; báo thời gian chạy và dung lượng.
- Được sửa: `tools/review/final-showcase.mjs` (mới), `tools/review/*.mjs` chỉ khi cần thêm option (không đổi hành vi mặc định), `docs/showcase/39-final/checklist.md` (mới, chỉ mẫu), test cho script nếu có helper thuần.
- Không được sửa: `src/**`, `public/**`, `docs/` khác, lockfile.
- Tổng dung lượng thư mục showcase ≤ 30 MB. Không commit ảnh thử.
- Xong: lệnh chạy được + output thật, gate PASS. Không commit.
