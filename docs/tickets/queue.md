# Hàng đợi ticket B2/B3 (ADR 0012)

Mỗi ticket 30–90 phút, 1 vùng file. Trạng thái: `todo` / `doing` / `review` / `merged` / `returned`. Worker lấy ticket `todo` đầu tiên **không trùng vùng file** với ticket `doing`. Ticket lớn hơn 90 phút → Lead chia nhỏ trước khi giao. Thẻ chi tiết: `docs/tickets/B2-*.md`; quy tắc chung: `_common-b2.md`.

Spec: §2.1 (8 khu, suối là trục), §7 (Atlas Journal), §8 (ngân sách), ADR 0013, `docs/art-bible/taste.md`.

## Đợt 15 — nền tảng (2026-11-05)

| ID | Việc | Vùng file | Trạng thái |
|---|---|---|---|
| B2-001 | Token bảng màu taste brief | `src/features/world/art/` | merged `ce5f1ef` (Lead) |
| B2-002 | Paper post pass (fog giấy, grain, vignette) | `src/features/world/post/paper.ts` | merged `b1f3827` |
| B2-003 | Sương phân lớp 3 dải + sương thấp | `post/paper.ts` | merged `2d75e5f` |
| B2-004 | Vật liệu toon ramp, bóng xanh/tím | `src/features/world/materials/` | merged `a05f5bd` |
| B2-010 | Suối chữ S, 8 khu, tuyến 370 s, ánh sáng theo vị trí (gộp B2-012) | `src/features/world/layout/`, `tools/world/` | merged `efecd51` |
| B2-011 | Heightfield theo suối, ô 64 m, streaming | `src/features/world/terrain/` | merged `74724b0` |
| B2-013 | Biển chỉ đường dịch chuyển + sự kiện ADR 0008 | `src/features/navigation/` | merged `0af8151` |
| B2-014 | Atlas Journal mô hình memory | `src/features/journal/` | merged `c0b303d` |
| B2-015 | Xe GD110 mô hình arcade | `src/features/vehicle/` | merged `906cac4` |
| B2-020 | Pipeline asset + kiểm ngân sách (gộp B2-021, `pnpm check:assets`) | `tools/assets/` | merged `a467dd0`; **CI chưa nối** |
| B2-032 | Khung ảnh film + trang tạp chí (server component) | `src/components/portfolio/memory/` | merged `e8aac68` |
| — | Lead: nối palette + ramp + paper pass vào world; sửa xung đột crown-fade | `src/features/world/index.ts`, `terrain.ts`, `crown-fade.ts` | merged `9e9867d` |

## Đợt 15b + 15c (2026-11-05)

| ID | Việc | Trạng thái |
|---|---|---|
| B2-005 | Loang mép màu nước + nét mực High (gộp B2-006) | merged  |
| B2-016 | Mesh + collider ô terrain, pool | merged  |
| B2-017 | Suối dải lụa + biển (Lead sửa mực nước) | merged  |
| B2-018 | Rải cây theo ô/biome | merged  |
| B2-019 | Trời + ánh sáng theo vị trí | merged  |
| B2-022 | check:assets vào CI (Lead) | merged  |
| B2-030 | Bàn dựng style frame (Lead thêm nước, fog, cảnh biển) | merged , ,  |
| B2-035 | Phác thảo nhân vật bpy (trả lại 1 vòng) | merged ,  |
| B2-036 | Phác thảo GD110 bpy | merged  |
| B2-040 | Atlas Journal dialog | merged  (chưa nối) |
| B2-050 | Ghép world thật | merged  |
| B2-060 | Cinematic mở đầu (model) | merged  (chưa nối) |

## Tiếp theo (todo)

| ID | Việc | Phụ thuộc |
|---|---|---|
| B2-031 | Chỉnh màu style frame A/B/C tới khi đạt (Lead + Art Director) | B2-030 |
| B2-033 | Showcase: 2 ảnh + video 15–20 s mỗi hướng + checklist cho Duy | B2-030, 031 |
| B2-034 | T08 trên laptop Iris Xe cho 3 hướng (chạy một mình) | B2-030 |
| B2-043 | Nối Journal (J), cinematic vào world | B2-040, B2-060 |
| B2-041 | Nối teleport vào world (E tại bảng, sương) | B2-013, 016 |
| B2-042 | Xe GD110 graybox nối collider + phím E/C | B2-015, 016 |

## Sau khi Duy chọn hướng

- T10 cảnh chuẩn 4 hướng → Duy duyệt.
- Turnaround nhân vật + GD110 (3 góc; ghi đông scrambler, Q-25).
- Intro (từ trên cao xuống suối) / ending, 4 secrets, mascot, audio (chỉ nhạc có giấy phép, Q-26).
