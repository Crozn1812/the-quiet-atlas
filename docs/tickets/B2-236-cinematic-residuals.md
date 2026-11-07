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
