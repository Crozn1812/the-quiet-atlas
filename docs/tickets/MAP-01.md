## TICKET MAP-01 — Thu ngắn tuyến đi bộ (ADR 0017)

Bối cảnh: `docs/tickets/R2-playtest-feedback.md` (dòng "Map quá dài và rộng"), `docs/adr/0017-shorter-walking-route.md`. Áp `_common-b2.md`, `_review-common.md`, `_graphics-common.md`. Ticket này chạy **một mình**: không worker nào khác sửa `src/features/world/` trong lúc làm.

**Mục tiêu (trải nghiệm):** người chơi đi bộ hết 8 khu trong khoảng 3,5–4 phút thay vì hơn 6 phút. Đường vẫn uốn theo suối, cảnh từng khu không đổi; chỉ đoạn đi giữa các khu ngắn lại.

**Đích đo (3 m/s, tuyến chính):**
- cả tuyến 200–240 s; Workshop 25–45 s; Roots và Milestones ≤ 60 s; hai khu bất kỳ cách nhau ≥ 25 m.

**Cách làm đề xuất:**
1. Trong `src/features/world/layout/` tạo một hằng số kích thước world (ví dụ `WORLD_SCALE` hoặc `WORLD_LENGTH`). `RIVER_CONTROL_POINTS` suy ra từ đó; thu cả chiều dài (Z) lẫn biên độ uốn (X). Chỉnh `t` của khu trong `zones.ts` nếu cần cho đủ đích đo.
2. Bỏ các số tuyệt đối gắn với chiều dài cũ, thay bằng giá trị suy ra từ hằng số trên hoặc từ `riverPointAt(1)`. Đã biết:
   - `terrain/height.ts` (smoothstep 760/900, `z + 900`, `-880`);
   - `terrain/detail.ts`, `terrain/mesh.ts` (`-720/-680`);
   - `zones/horizon.ts` (hướng nhìn biển `-20, 0, -900`);
   - `scene/far-landscape.ts` (vùng phủ `z −900…0`);
   - `art/direction.ts` (fog `far`/`coastFar` theo tỷ lệ world).
   Grep thêm các số `-5xx…-9xx`, `900`, và ranh giới biome/ánh sáng (`layout/lighting.ts`, `PATH_BRIDGES`, đoạn đường nhựa trong `road/*`, `shore/*`, cinematic intro/ending trong `cinematic/*`).
3. Kiểm tra từng khu sau khi dời: không có vật nổi, đè lên suối/đường, hay mắc vào bờ; cầu vẫn nằm đúng chỗ suối; đường nhựa ven biển, lan can, ghế Horizon vẫn dùng được.

**Được sửa:** `src/features/world/**`, `src/features/navigation/*`, `src/features/story/*`, `src/features/audio/*` (chỉ chỗ đọc vị trí), `tools/world/*`, `tools/wayfinding/*`, `tools/styleframes/*` (chỉ chỗ đọc layout), `tests/unit/**`, `tests/perf/*` nếu có kỳ vọng vị trí. Đổi test **có chủ đích** theo ADR 0017; ghi từng test đã đổi và lý do trong bàn giao.
**Không được sửa:** `package.json`, lockfile, `docs/`, `src/components/`, `src/app/`, `public/world/` (không cần asset mới).

**Điều kiện xong:**
- `bash tools/lead/gate.sh .` → GATE PASS (dán dòng cuối).
- `layout.test.ts` kiểm đích đo mới; dán `routeSeconds()` và `secondsToZone()` của 8 khu.
- Build một lần (lệnh WASM trong `_common-b2.md`), e2e world `--workers=2` (`world*.spec.ts`, `q15*`, `full-viewport`): dán tổng kết.
- `node tools/review/ingame-shots.mjs <out> http://127.0.0.1:<cổng>` High đủ 8 khu + `wide-shots.mjs` cho First Light, Horizon, Last Postcard; `luma.mjs` so với main. Dán đường dẫn ảnh.
- Intro và ending: `intro-shots.mjs`, `ending-shots.mjs` không lộ mép terrain hay khoảng trống.

**Bàn giao:** danh sách file, output lệnh thật, bảng thời gian trước/sau, các test đã đổi, giới hạn còn lại. Không commit.
