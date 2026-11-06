## TICKET B2-234: cảnh mở đầu theo hướng A (hết "giấy kem + dải suối")

- Đọc `_ux-common.md`, `_dirA-common.md`, ADR 0013 bổ sung "Tranh chân thật", taste §5.2 (mô-típ suối chữ S, intro từ cao xuống suối, hạ dần xuống lá, nước, sương), spec §6.2 (intro mỗi lần Enter World, có Skip, §9 reduced motion).
- Được sửa: `src/features/world/cinematic/intro.ts`; trong `src/features/world/index.ts` **chỉ** phần áp khung intro lên camera/fog/paper (mistBoost, paperOpacity, corridor mask); `src/features/world/post/paper.ts` **chỉ** phần mặt nạ hành lang giấy cho intro; test `intro*`.
- Ảnh hiện trạng: `docs/showcase/28-ux/hien-trang/intro-1-5s.webp`, `intro-7s.webp`, `intro-10s.webp`: suốt ~7–10 s đầu chỉ thấy **nền giấy kem với một dải suối xanh nhạt** (di sản hướng C), rồi rừng chìm trong sương trắng. Nguyên nhân: camera ở **460 m** trong khi fog rừng hết ở 145 m; mặt nạ "paper corridor" vẫn bật.

### Việc

1. Đường bay mới (tổng 18–22 s, giữ API `IntroFrame`): mở ở **80–140 m** phía trên hạ lưu suối, nhìn chếch xuống thấy suối uốn chữ S giữa tán rừng, trời bình minh và mây (hướng A) → bay ngược dòng, hạ dần → lướt sát tán lá/mặt nước → về đúng pose bàn giao hiện có (giữ test endpoint).
2. Trong intro: fog/mist dùng khoảng cách **nới theo độ cao camera** (không màn trắng), không dùng mặt nạ giấy/`paperOpacity` (luôn 0 ở hướng R); sương sớm chỉ là lớp mỏng ở thung lũng.
3. Giữ: Skip/Esc, letterbox, reduced motion (fade ngắn), không lưu trạng thái, camera không xuyên địa hình (clearance hiện có).

### Test

- Tại các mốc 1, 5, 10, 15 s: camera cao 15–140 m trên terrain; khoảng cách camera→suối gần nhất ≤ fog far hiệu dụng (để nhìn thấy cảnh).
- `paperOpacity` = 0 với `WORLD_DIRECTION` R ở mọi thời điểm.
- Endpoint, thời lượng, Skip, reduced motion: test cũ pass.

### Trả lại vòng 1 (Lead)

`tests/unit/world/cinematic.test.ts` còn 2 test mô tả đường bay cũ và đang FAIL:
- "frames four alternating river bends from near vertical" (`expected 119.69 >= 120`)
- "descends along the river toward spawn, builds mist, and holds a 1–2 m detail shot" (`expected 69.23 < 20.1`)

Viết lại 2 test này theo thiết kế mới (mở 80–140 m, nhìn chếch ngược dòng thấy ≥2 khúc uốn S; hạ dần; mist chỉ ≤ 0.08; vẫn có cảnh lướt sát mặt nước/lá trước khi về pose bàn giao). Không nới ngưỡng cho khớp số; mô tả đúng hành vi mới. Chạy `pnpm vitest run tests/unit/world` và dán kết quả.

### Trả lại vòng 2 (Lead, review render)

Test đã xanh nhưng render chưa đạt. Ảnh: `docs/showcase/28-ux/lead-review/b2-234-r1-1-5s.webp`, `-7s.webp`, `-10s.webp` (build worktree, Edge 1600×900).

1. **Trời vẫn là nền kem phẳng**, không thấy sky dome/mây bình minh. Sky dome (`sky/dome.ts`, bán kính 80, `depthTest:false`) bám camera. Tìm vì sao trong intro vùng trời ra màu kem: (a) pass hậu kỳ paper/graded đang phủ fog màu giấy lên pixel trời (depth = 1)?, (b) `scene.background`/clear color kem?, (c) sky bị ẩn hoặc chưa `update` trong intro? Sửa để trong intro trời giống hệt gameplay hướng R (gradient + mây + nắng sớm).
2. **Lộ mép tile**: ở 1,5 s và 7 s thấy địa hình bị cắt cạnh thẳng, ngoài là khoảng kem trống. Chọn một trong hai: stream tile quanh **vị trí camera** suốt intro (trong ngân sách hiện có), hoặc chỉnh khung hình (thấp hơn, nhìn chếch về phía có tile, có lớp far-landscape/đồi xa che chân trời) để **không khung nào** thấy mép tile hay nền trống. Thêm test: tại 1, 5, 10, 15 s mọi tia từ camera qua 4 góc + giữa khung dưới đường chân trời đều chạm một tile đã nạp hoặc far-landscape.
3. **Letterbox + màn fade màu kem** (`PALETTE.paper` trong `createCinematicUI`): ở hướng R dùng màu mực tối (`PALETTE.ink`) cho thanh letterbox và fade, cho cả intro lẫn ending.
4. **Khung 10 s**: camera nhìn gần thẳng xuống ở cự ly sát, chỉ thấy một vệt suối và tán cây vỡ hạt. Đổi đoạn 8–15 s thành **lướt thấp 8–20 m nhìn chếch ngược dòng** (thấy mặt nước, hai bờ cây, có trời ở 1/4–1/3 trên khung).

Tiêu chí duyệt: Lead chụp lại 1,5 / 4 / 7 / 10 s + sau intro; không có nền kem, không mép tile, thấy trời + suối + rừng ở mọi khung trước 15 s.
