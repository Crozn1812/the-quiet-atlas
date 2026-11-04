# Hàng đợi ticket B2/B3 (ADR 0012)

Mỗi ticket 30–90 phút, 1 vùng file. Trạng thái: `todo` / `doing` / `review` / `merged` / `returned`. Worker lấy ticket `todo` đầu tiên **không trùng vùng file** với ticket `doing`. Ticket lớn hơn 90 phút → Lead chia nhỏ trước khi giao.

Spec: §2.1 (8 khu, suối là trục), §7 (Atlas Journal), §8 (ngân sách), ADR 0013, `docs/art-bible/taste.md`.

## Đợt 15 — Vòng duyệt gu + graybox (ADR 0013 mục 4a, 4d)

| ID | Việc | Vùng file | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| B2-001 | Bảng màu taste brief thành token TS (10 màu, vai trò) + unit test giá trị hex | `src/features/world/art/palette.ts`, test | — | todo |
| B2-002 | Hậu kỳ "giấy" rẻ: 1 pass gộp fog màu giấy + paper grain tile 256 px (Low) — có cờ bật/tắt | `src/features/world/post/paper/` | B2-001 | todo |
| B2-003 | Sương phân lớp theo độ sâu (3 dải, nhạt dần về giấy) cho Balanced/High | `src/features/world/post/mist/` | B2-001 | todo |
| B2-004 | Toon ramp mềm 3–4 bậc + bóng màu xanh/tím nhạt (thay material chuẩn của terrain/cây) | `src/features/world/materials/ramp/` | B2-001 | todo |
| B2-005 | Loang mép màu nước (edge bleed) — chỉ Balanced/High, đo chi phí | `src/features/world/post/watercolor/` | B2-002 | todo |
| B2-006 | Outline mực (Balanced/High, tắt mặc định tới khi Perf Watcher đo) | `src/features/world/post/ink/` | B2-002 | todo |
| B2-010 | Graybox layout 8 khu dọc suối chữ S: spline suối + 8 điểm neo khu (dữ liệu, không art) | `src/features/world/layout/` | — | todo |
| B2-011 | Terrain graybox theo spline (lòng suối thấp, đồi hai bên) | `src/features/world/terrain/` | B2-010 | todo |
| B2-012 | Đo tuyến 5–7 phút: script đi theo spline với tốc độ đi bộ/xe, in thời gian | `tools/world/route-time.mjs` | B2-010 | todo |
| B2-013 | Biển chỉ đường dịch chuyển giữa khu (graybox) + sự kiện ADR 0008 | `src/features/navigation/` | B2-010 | todo |
| B2-014 | Atlas Journal (J) §7.2 graybox: danh sách khu đã ghé, chỉ trong memory | `src/features/journal/` (mới) | B2-010 | todo |
| B2-015 | Xe GD110 graybox (khối hộp + 2 bánh), lên/xuống xe, manual | `src/features/vehicle/` (mới) | B2-011 | todo |
| B2-020 | Pipeline asset: Blender headless bpy → glTF → gltf-transform meshopt + KTX2; script + báo cáo byte | `tools/assets/` | — (Lead cài Blender/KTX) | todo |
| B2-021 | Kiểm ngân sách world: tổng byte `public/world/**` ≤ 30 MB, phần bắt đầu chơi ≤ 8 MB — thêm vào CI | `tools/checks/world-budget.mjs`, `.github/` | B2-020 | todo |
| B2-030 | Style frame cảnh 1: góc rừng bình minh có suối (dùng B2-002…006) — preset A / B / C | `src/features/world/styleframes/` | B2-002, 003, 004 | todo |
| B2-031 | Style frame cảnh 2: góc biển hoàng hôn — preset A / B / C | `src/features/world/styleframes/` | B2-030 | todo |
| B2-032 | Mẫu overlay tạp chí (1 trang) + mẫu "ảnh film" ký ức (viền, hạt, ngày tháng cam) — HTML/CSS, không ảnh thật | `src/components/portfolio/memory/` | B2-001 | todo |
| B2-033 | Quay showcase: 2 ảnh + video 15–20 s mỗi hướng (ffmpeg) + checklist cho Duy | `docs/showcase/15-style-frames/` | B2-030, 031 | todo |
| B2-034 | T08 trên laptop Iris Xe cho 3 hướng (chạy một mình; runbook cho Duy nếu Lead không điều khiển được laptop) | `docs/runbook/t08-iris-xe.md`, `docs/evidence/` | B2-030 | todo |

## Sau khi Duy chọn hướng (chưa mở)

- T10 cảnh chuẩn 4 hướng → Duy duyệt.
- Turnaround nhân vật + GD110 (3 góc) — cần Q-28 (ảnh tham chiếu trên đĩa), Q-25 (ghi đông).
- Foliage/water/sky, intro (từ trên cao xuống suối) / ending, 4 secrets, mascot, audio (chừa slot Q-26).
