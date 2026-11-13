## GFX-P6 — Intro và ending hướng C (Codex B)
Intro (bình minh First Light) và ending (hoàng hôn Last Postcard) dùng hệ C đã merge: IBL/hậu kỳ GFX-P1 (`post/cinematic.ts`, `post/runtime.ts`), cây GFX-P3, nước GFX-P4. Chỉnh khung máy quay, ánh sáng, grading và DOF riêng cho cinematic (DOF được dùng ở cinematic cả Balanced; tắt ở Low). Giữ thời lượng, phụ đề, nút bỏ qua, reduced-motion, và `data-world-build` không chờ asset C.
Được sửa: `src/features/world/cinematic/**`, `post/cinematic.ts`, test. Không sửa `index.ts` (nếu cần nối, ≤ 5 dòng và ghi trong bàn giao).
Ảnh: 6 khung intro + 6 khung ending (High) + 1 khung Low mỗi đoạn; video 30–60 s mỗi đoạn vào `docs/showcase/38-c/` nếu ghi được.

Chung cho mọi ticket GFX-P*:
- Áp `_common-b2.md`, `_graphics-common.md`; đọc `docs/adr/0018-graphics-direction-c.md`, `docs/art-bible/taste.md`.
- Nguồn tham khảo đã có: bàn dựng `tools/styleframes/` (GFX-01: `createPost`, preset C, đo chi phí) trong nhánh `lane/GFX-01`; kho cây/đá `lane/GFX-02`. Lead merge hai nhánh này trước khi giao.
- Texture/HDRI/mô hình **CC0 thật** qua Blender MCP của bạn (Poly Haven) hoặc ambientCG; mỗi file một dòng `assets/LICENSES.csv`; KTX2 High 2K / Balanced 1K / Low 512; nạp **deferred** sau khi chơi được.
