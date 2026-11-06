## TICKET B2-235: hoàn thiện cảnh mở đầu + cảnh kết (hướng A)

- Đọc `_ux-common.md`, `_dirA-common.md`, B2-234 (đã merge), spec §6.2, §7 (ending), taste §5.
- Được sửa: `src/features/world/cinematic/*`, trong `src/features/world/index.ts` **chỉ** các hàm áp khung intro/ending (`applyCinematicPose`, `applyIntro`, `applyEnding`, `createCinematicUI`, phần ending atmosphere ~dòng 1100–1140); test `intro*`, `ending*`, `cinematic*`.
- Công cụ duyệt: `node tools/review/ending-shots.mjs <dir>` (cần build + server `out/` cổng 4180). Intro: chụp 1,5 / 4 / 7 / 10 s.

### Ảnh hiện trạng
- Intro: `docs/showcase/28-ux/lead-review/b2-234-r2-1-5s.webp`, `-7s`, `-10s`.
- Ending: `docs/showcase/28-ux/hien-trang/ending-sheet.webp` (0,5 / 4 / 9 / 14 / 20 / 26 / 31 / 34,5 s / sau ending).

### Việc

**Intro**
1. Khung 1,5 s: nửa trên vẫn là nền kem phẳng, chưa có gradient trời/mây như ở 7 s; một dải sương xanh nhạt phẳng như bức tường ở chân trời. Trời phải đúng như 7 s ngay từ khung đầu; chân trời là đồi xa nhạt dần, không phải dải màu phẳng.
2. Khung 10 s: tán cây sát camera hiện dạng khối LOD thô (mặt phẳng nhòe). Hoặc dùng LOD theo **vị trí camera** trong intro, hoặc giữ camera cách tán ≥ khoảng LOD gần.

**Ending**
3. 26–34,5 s (đoạn bưu thiếp cuối): biển thành mảng xanh-đen phẳng, mất trời và nắng hoàng hôn, có mảng xanh đậm hình tam giác lớn bên trái (mặt địa hình/tile thiếu sáng hoặc mép tile). Giữ không khí hoàng hôn ven biển (`applyCoastAtmosphere` theo vị trí **camera**/bench, không theo nơi khác), khung nhìn có đường chân trời + mặt trời thấp ở 1/4–1/3 trên khung, không lộ mép tile.
4. 0,5–9 s: thẻ thơ của bí mật che nhân vật ngồi ghế; trong ending đặt thẻ ở vị trí không che chủ thể (vd. góc trên) hoặc ẩn khi camera bắt đầu kéo ra; dòng gợi ý phím (HUD hint) ẩn trong ending.
5. Thanh dock HUD dưới trái: ẩn (fade) trong intro và ending, hiện lại khi bàn giao.

### Test
- Intro + ending: tại các mốc chụp, khung dưới đường chân trời không chạm vùng ngoài tile đã nạp (dùng helper từ B2-234 nếu có).
- Ending: tại 26, 31, 34 s grade ánh sáng có `coastWeight` ≥ 0.8; mặt trời trong frustum hoặc ngay trên mép khung.
- Dock/hint ẩn khi `data-world-intro`/ending đang chạy; test cũ pass.
