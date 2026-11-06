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
