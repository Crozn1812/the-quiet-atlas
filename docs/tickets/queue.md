# Hàng đợi ticket B2/B3 (ADR 0012)

Mỗi ticket 30–90 phút, 1 vùng file. Trạng thái: `todo` / `doing` / `review` / `merged` / `returned`. Worker lấy ticket `todo` đầu tiên **không trùng vùng file** với ticket `doing`. Ticket lớn hơn 90 phút → Lead chia nhỏ trước khi giao. Thẻ chi tiết: `docs/tickets/B2-*.md`; quy tắc chung: `_common-b2.md`.

Spec: §2.1 (8 khu, suối là trục), §7 (Atlas Journal), §8 (ngân sách), ADR 0013, `docs/art-bible/taste.md`.

## Cập nhật đợt 31 — UX/UI (2026-11-08)

**Mới nhất — FL-01:** Duy chưa duyệt gu đợt 31. Mẫu First Light đã **review**, nhánh `lane/FirstLight-R1`, source `56d29d5`, docs `720e48e`, chưa merge. Xem `docs/showcase/32-first-light-prototype/README.md`. Chờ Duy chấm mẫu; CPU chưa chốt PASS, chưa mở rộng tác nhân sang 7 khu.

| ID | Việc | Trạng thái |
|---|---|---|
| U-02 | Ảnh bưu thiếp engine 8 khu, overlay tạp chí, Close sticky mobile | merged `f20147d` |
| U-03 | CTA Welcome, hero hiện tại, VI/EN desktop/390/320 px | merged `f20147d` |
| UX-QA | Sổ Atlas/Đi tới… accessible name, lifecycle cleanup, focus/reflow audit | merged `f20147d` |
| UX-pause-fix | Pause queue/render, giữ ảnh tạm dừng, locator visited, benchmark CPU đồng nhất | merged `7774ae8` |

Gate cuối main `7774ae8`: unit 1697/1697, full e2e 151/151, load-budget EN/VI và Lighthouse 15 lượt PASS. Xem `docs/showcase/31-ux-final/qa-final.md`. Tiếp theo: Duy chấm UX/gu và T10; T08/T09 Iris Xe vẫn NOT RUN. Không chạy lại U-02/U-03 cũ.

## Đợt 15 — nền tảng (2026-11-05, lịch sử)

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
| B2-020 | Pipeline asset + kiểm ngân sách (gộp B2-021, `pnpm check:assets`) | `tools/assets/` | merged `a467dd0` (CI nối ở B2-022) |
| B2-032 | Khung ảnh film + trang tạp chí (server component) | `src/components/portfolio/memory/` | merged `e8aac68` |
| — | Lead: nối palette + ramp + paper pass vào world; sửa xung đột crown-fade | `src/features/world/index.ts`, `terrain.ts`, `crown-fade.ts` | merged `9e9867d` |

## Đợt 15b + 15c (2026-11-05)

| ID | Việc | Trạng thái |
|---|---|---|
| B2-005 | Loang mép màu nước + nét mực High (gộp B2-006) | merged `f3115ba` |
| B2-016 | Mesh + collider ô terrain, pool | merged `f6e0f8b` |
| B2-017 | Suối dải lụa + biển (Lead sửa mực nước) | merged `1297c71` |
| B2-018 | Rải cây theo ô/biome | merged `30249b5` |
| B2-019 | Trời + ánh sáng theo vị trí | merged `783a745` |
| B2-022 | check:assets vào CI (Lead) | merged `593fd11` |
| B2-030 | Bàn dựng style frame (Lead thêm nước, fog, cảnh biển) | merged `45abd0b`, `d3f679c`, `f20ce47` |
| B2-035 | Phác thảo nhân vật bpy (trả lại 1 vòng) | merged `7a8bea9`, `edccdd6` |
| B2-036 | Phác thảo GD110 bpy | merged `6b20929` |
| B2-040 | Atlas Journal dialog | merged `4270d1d` (chưa nối) |
| B2-050 | Ghép world thật | merged `98e01a9` |
| B2-060 | Cinematic mở đầu (model) | merged `2fb77da` (chưa nối) |

## Đợt 16 (2026-11-05)

| ID | Việc | Trạng thái |
|---|---|---|
| B2-031 | Chỉnh màu style frame (Lead + Art Director 1 vòng): tone map chỉ cảnh 3D, fog/sương theo chân trời, biển ngọc, tán nhiều tầng, đồi thung lũng | merged `143bb8e`, `53913bc` |
| B2-037 | Bờ biển hữu cơ: đường bờ cong, bãi cát, cửa suối tan vào biển (Lead giữ lại màu thung lũng, mở lòng suối qua nền khô) | merged `7c370e8`, `4bdc00c` |
| B2-033 | Showcase: 6 ảnh + 6 video 18 s + checklist (`docs/showcase/16-styleframes/`) | xong (video chỉ local) |

## Đợt 17 (2026-11-05)

| ID | Việc | Trạng thái |
|---|---|---|
| B2-038 | World theo hướng C (Lead): preset vào `art/direction.ts`, fog 40/260 m, sương/viền/trời C | merged `4964fba` |
| B2-043b | Cinematic mở đầu nối vào world + Skip (Codex; Lead sửa sương nền, Esc qua menu, e2e fixture) | merged `35e4283` |
| B2-043a | Atlas Journal trong world, phím J (Codex; Lead thêm pause reason `journal`, chặn J khi intro, e2e) | merged `e96d143` |
| B2-039a | Dáng cây vẽ tay: 3 thông + 2 lá rộng (Codex; Lead nối fade theo biến thể) | merged `0c2c184` |
| — | Lead review cinematic: fog kéo dài khi bay cao, tải trước 600 m, mặt nạ hành lang giấy, cận suối nhìn xuôi dòng | merged `9891cb9` |

## Đợt 18–20 (2026-11-05): 15 ticket, tối đa 12 Codex worker song song

| ID | Việc | Trạng thái |
|---|---|---|
| B2-046 | Biển chỉ đường + bàn vẽ tay | merged `31816d7`, nối `57a7be0` |
| B2-045a/b | Rig nhân vật (Lead chạy Blender, sửa trọng số) + runtime nạp GLB/trộn animation | merged `f6424dc`, `1e47c2a`, nối `57a7be0` |
| B2-047 | Cỏ + đá theo ô | merged `a55233f`, nối `211ae40`, màu `53156c7` |
| B2-041a/b | Dịch chuyển: 8 biển + hộp chọn khu | merged `be46f57`, `fb63101` |
| B2-048 / B2-042 | GD110 procedural + lên xe/lái/Auto Cruise | merged `14f4983`, `3d075b2` |
| B2-070 / B2-071 / B2-061 / B2-073 | Secrets (mô hình, mốc cảnh, ending, nối world) | merged `5f437fc`, `d0f4e02`, `1154c21`, `b594265` |
| B2-072 / B2-074 | Mascot (mô hình + nối, nút tắt trong menu) | merged `a161156`, `e95a4c8` |
| B2-080 / B2-081 | Âm môi trường tổng hợp + nút Sound | merged `17a8e9a`, `ce1dbcb` |
| — | Lead: tạm dừng = đứng yên hoàn toàn (e2e bắt) | `abb6c2d` |

## Đợt 21–22 (2026-11-05): 8 khu hoàn chỉnh + UX/UI

| ID | Việc | Trạng thái |
|---|---|---|
| B2-101…108 | Dựng cảnh 8 khu (procedural, hợp đồng `zones/types.ts`) | merged |
| B2-109 | Địa hình dấu mốc (đồi Milestones, mỏm Horizon, thềm Workshop) | merged `73849a1` |
| B2-111 / B2-112 | Menu đủ mục §6.4; HUD Sổ Atlas, gợi ý phím 10 s, thẻ tên khu | merged `c92092c`, `6510f7e` |
| B2-115 | Overlay tạp chí cho 8 khu (4 khu chờ nội dung Q-34…37) | merged `b25525f` |
| B2-100 | Nối 8 khu vào world, interactable mọi khu, zone-enter, set-motion, bỏ chữ tạm (Lead hoàn tất khi Codex hết lượt) | merged `6fb5a54` |
| B2-121, 122, 123, 124, 125, 127, 128 | Sửa vòng 2 theo Art Director | merged |
| B2-129 | Thông Đà Lạt cao 14–18 m | merged `34d17c5` |
| B2-126 | Horizon vòng 2 | **bỏ** (vỡ world trên địa hình thật) → B2-126b |

## Chờ Codex (khi Duy đổi tài khoản)

| ID | Việc |
|---|---|
| B2-126b | Horizon vòng 3, test trên địa hình thật |
| B2-130 | Bờ suối răng cưa dưới Milestones/Horizon (Lead đã thử 1 cách, chưa đạt; xem ghi chú trong thẻ) |

## RC-01 — review để Claude-Lead merge (2026-11-10)

| ID | Trạng thái | Bàn giao |
|---|---|---|
| RC-01, các ticket con RC-02…RC-22 | review | Clone `D:/tqa-worktrees/RC-01`, `lane/RC-01`, nguồn RC `bbd85a7`; đủ gate/render máy dev, chưa merge do `.git` main chỉ đọc. [Kết quả](../showcase/35-rc/audit.md), [hướng dẫn Duy](../playtest/rc-guide.md). Claude-Lead fetch/duyệt/merge theo handoff; không push |

## Tiếp theo (todo)

| ID | Việc | Phụ thuộc |
|---|---|---|
| B2-034 | T08 trên laptop Iris Xe cho 3 hướng (chạy một mình) | B2-030 |
| B2-044 | Nguồn suối: dải nước thu hẹp và tan vào đất ở t=0 (hiện cắt thẳng cạnh spawn) | — |

| B2-090 | Quay video ending trong world bằng hook test (chưa xem bằng mắt) | — |
| B2-091 | Âm riêng cho Forgotten Sound (tổng hợp) + đề xuất nhạc có giấy phép (Q-26) | — |
| B2-034 | T08/T09 FPS trên Iris Xe — **ưu tiên**: đợt này thêm skin, cỏ, xe, mascot | Duy chạy trên laptop |

## Sau khi Duy chọn hướng

- T10 cảnh chuẩn 4 hướng → Duy duyệt.
- Turnaround nhân vật + GD110 (3 góc; ghi đông scrambler, Q-25).
- Intro (từ trên cao xuống suối) / ending, 4 secrets, mascot, audio (chỉ nhạc có giấy phép, Q-26).
