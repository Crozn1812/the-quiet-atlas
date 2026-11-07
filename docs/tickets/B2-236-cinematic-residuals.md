## TICKET B2-236: dọn hai lỗi còn lại của cinematic

- Đọc `_ux-common.md`, `_dirA-common.md`, B2-234/235 (đã merge).
- Được sửa: `src/features/world/cinematic/*`; trong `src/features/world/index.ts` **chỉ** phần áp khung intro/ending; nếu nguyên nhân nằm ở far-landscape hoặc tile địa hình thì được sửa `src/features/world/terrain/far-landscape*` (chỉ phần hiển thị trong cinematic, không đổi gameplay); test liên quan.
- Công cụ duyệt: build + `node tools/serve-out/index.mjs out --port 4180`; `node tools/review/ending-shots.mjs <dir>`; intro chụp 1,5 / 4 / 7 / 10 s.

### Lỗi
1. **Ending 26–34 s** (`docs/showcase/28-ux/lead-review/b2-236-ending-31s.webp`): góc dưới phải có **mảng đất gần đen hình tam giác** ở tiền cảnh (mép tile/far-landscape thiếu sáng hoặc dưới mặt cát). Thêm nữa, trên biển gần bờ trái có một **vùng tối hình mép đất** chìm dưới nước. Tìm nguyên nhân bằng cách in object trúng tia từ camera qua pixel đó (raycast) ở 31 s; sửa để tiền cảnh là cát/cỏ được chiếu sáng như phần còn lại, hoặc chỉnh khung tránh mép đó (giữ mặt trời + vệt nắng + đảo).
2. **Intro 1,5–10 s** (`b2-236-intro-4s.webp`): chân trời là **một dải xanh nhạt phẳng có mép trên cứng** (fog màu xanh gặp trời kem). Chân trời phải chuyển mượt: đồi xa nhạt dần vào màu chân trời của sky dome (cùng màu `skyHorizon`), không có đường biên màu ngang.

### Test
- Ending 26/31/34 s: không pixel nào dưới chân trời có độ sáng < ngưỡng tối của cát/cỏ đang được chiếu (dùng test logic, ví dụ raycast từ camera qua lưới 8×5 điểm chỉ trúng mesh đã biết, không trúng mặt dưới/mép tile).
- Intro: màu fog trong intro = màu `skyHorizon` của grade hiện tại (sai số nhỏ).
- Test cũ pass.

### Trả lại vòng 1 (Lead, review render)

- Intro: **đạt** (chân trời chuyển mượt vào màu trời).
- Ending: **chưa đạt**. `docs/showcase/28-ux/lead-review/b2-236-r0-ending-sheet.webp` (20 / 26 / 31 / 34,5 s): mảng gần đen hình tam giác **vẫn còn** ở góc dưới 31 và 34,5 s; ở 26 s có vách tối cạnh đường. `coast-light` (đổi màu mesh thấp) không trúng nguyên nhân.
  1. Xác định object thật: trong ending ở 31 s, raycast từ camera qua pixel (0,55·W; 0,95·H) và (0,85·W; 0,9·H); ghi `name`, `type`, material, normal tại điểm trúng vào phần bàn giao. Nếu tia không trúng gì → đó là nền/clear color hoặc mặt sau bị cull: sửa đúng chỗ đó (ví dụ tile chưa nạp quanh camera → stream tile quanh vị trí camera trong ending như intro đã làm, hoặc đổi khung).
  2. Bỏ `coast-light` nếu không còn cần sau khi sửa nguyên nhân.
- Kỹ thuật: **không** `paper.dispose()` + tạo pass mới + `Object.assign(paper, …)` giữa intro (biên dịch lại shader khi bàn giao, dễ giật khung, dễ rò). Thay bằng API trên pass hiện có, ví dụ `paper.setFogColorOverride(color | null)` để grade không ghi đè màu fog trong intro.
