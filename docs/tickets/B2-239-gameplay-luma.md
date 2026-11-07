## TICKET B2-239: độ sáng lúc chơi theo art bible (rừng, đồi, biển)

- Đọc `docs/art-bible/lighting.md` (đã khóa), `palette.md`, `_dirA-common.md`, `_ux-common.md`.
- Được sửa: `src/features/world/sky/grade.ts`, `src/features/world/art/direction.ts` (preset R: fog/mist/ground), `src/features/world/layout/lighting.ts`, vật liệu địa hình/mặt đất (`src/features/world/terrain/*material*`, `ground*`), vật liệu nước (`src/features/world/water/*`); test liên quan. **Không** sửa `src/features/world/index.ts`, `scene/paper.ts`, `cinematic/*` (đang có ticket khác).
- Công cụ duyệt: build + `node tools/serve-out/index.mjs out --port 4181`; `node tools/review/ingame-shots.mjs <dir> http://127.0.0.1:4181 vi`; `node tools/review/luma.mjs <dir>`.

### Hiện trạng (main, Edge 1600×900, `ingame-shots`, luma = trung bình xám 0..1)
Ảnh: `docs/showcase/29-hoan-thien/hien-trang/ingame-8-khu-luma.webp`

| Khu | luma | Mục tiêu |
|---|---|---|
| first-light | 0,187 | 0,24–0,32 |
| roots | 0,198 | 0,24–0,32 |
| workshop | 0,194 | 0,24–0,32 |
| milestones | 0,189 | 0,24–0,32 |
| old-trail | 0,401 | 0,30–0,42 (giữ) |
| horizon | **0,161** | 0,30–0,42 (đồi phải sáng hơn rừng và biển, `lighting.md`) |
| quiet-shore | 0,208 | 0,22–0,30 |
| last-postcard | 0,211 | 0,22–0,30 |

Nhận xét Lead: rừng chìm trong sương xanh đen, nhân vật và lối đi khó đọc; Horizon (đồi) tối như rừng; biển ở Quiet Shore/Last Postcard là mảng xanh chàm phẳng, ít ánh hoàng hôn; dải đất nâu tối lớn ở mép trái Quiet Shore.

### Việc
1. Đưa luma từng khu vào khoảng mục tiêu bằng **nguồn sáng/fog/albedo** (hemi, sun, độ dày sương rừng, màu mặt đất, AO/bóng), không bằng một hệ số phơi sáng toàn cục, không đổi hướng màu (bình minh rừng mát, đồi xanh trong, hoàng hôn biển ấm).
2. Horizon: đồi sáng nắng muộn đúng `tod=0.5` như bảng trong `lighting.md`; kiểm tra vì sao bị tối (fog rừng còn áp? grade sai vị trí?).
3. Biển hoàng hôn khi chơi: có chuyển màu xanh chàm → cam ở phía mặt trời, không phẳng.
4. Giữ độ mượt chuyển sáng theo đường (`sky.test.ts`), luma prop ≥ 0,12 ở 15 m.

### Test
- Unit: cập nhật/giữ `sky.test.ts`; thêm kiểm tra horizon reference luma > rừng và > biển.
- Bàn giao: bảng luma 8 khu sau sửa (chạy `luma.mjs`), kèm đường dẫn ảnh.
