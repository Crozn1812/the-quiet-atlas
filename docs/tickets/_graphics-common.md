## Chung cho ticket đồ họa G-xx (ADR 0014)

- **Đọc trước:** `docs/adr/0014-graphics-production-pass.md`, `docs/art-bible/` (đã khóa: palette, lighting, materials, shading, taste), `_review-common.md`, `docs/art-bible/asset-budgets.md`.
- **Công cụ có sẵn trên máy:**
  - Blender 5.2: `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P <script> -- <args>`;
  - KTX-Software: `toktx` và `ktx` đã có trong PATH;
  - `node tools/assets/optimize.mjs`, `node tools/assets/check-budgets.mjs public/world`.
- **Nguồn asset:**
  - texture và mô hình do script trong repo **tự sinh**, chạy lại được;
  - không tải ảnh hay mô hình từ ngoài;
  - mỗi file public có một dòng trong `assets/LICENSES.csv`, ghi "project-original";
  - file trung gian để ở `tmp/` (đã gitignore).
- **Màu:** chỉ lấy từ `PALETTE` và art bible. Texture chỉ thêm chi tiết độ sáng và vi sắc quanh màu đó, không đổi hướng màu.
- **Công tắc theo mức chất lượng:** Low giữ cách vẽ cũ hoặc bản rẻ nhất; High có đủ chi tiết.
- **Bàn giao gồm:**
  - ảnh trước/sau (đủ 8 khu và phần liên quan);
  - bảng luma, mỗi khu lệch không quá ±0,03, trừ khu ticket chủ đích sửa;
  - `pnpm test:perf load-budget`: vào chơi được ≤ 6 s, 3D lúc đầu ≤ 8 MB;
  - `node tools/review/cpu-compare.mjs`: không quá main + 10 ms/s;
  - số tam giác, draw call và byte trước/sau.
