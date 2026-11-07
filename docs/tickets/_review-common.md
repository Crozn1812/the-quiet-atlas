## Quy tắc duyệt render (áp cho mọi ticket hình ảnh từ đợt 30)

- Tự build và chụp trước khi bàn giao: `pnpm build`; `node tools/serve-out/index.mjs out --port <cổng riêng của ticket>` (chạy nền); rồi:
  - `node tools/review/ingame-shots.mjs <dir> http://127.0.0.1:<cổng> vi` (**đủ 8 khu**, không chỉ khu của ticket);
  - `node tools/review/ending-shots.mjs <dir> http://127.0.0.1:<cổng>` nếu chạm nước/biển/ánh sáng ven biển;
  - `node tools/review/luma.mjs <dir>` và `node tools/review/ground-hue.mjs <dir>`.
- Bàn giao kèm bảng luma 8 khu trước/sau. Không khu nào lệch quá ±0,03 so với trước, trừ khu mà ticket chủ đích sửa.
- Hiệu năng: chạm mỗi khung (update/shader nặng hơn) thì đo `node tools/review/cpu-compare.mjs <base>` với main (4180) và bản mình; không tệ hơn main quá +10 ms/s.
- Không commit thư mục ảnh tạm (`.tmp/`, `.artifacts/`); xoá trước khi bàn giao.
