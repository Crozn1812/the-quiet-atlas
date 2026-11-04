## TICKET B2-030 — Bàn dựng style frame A/B/C (trang Vite riêng, không vào web)

- Trạng thái: Assigned → Codex, đợt 15c, nhánh `lane/B2-030`
- Đọc trước: `docs/tickets/_common-b2.md`; `docs/adr/0013-art-direction-painted-world-film-memories.md` mục 4; `docs/art-bible/taste.md` §5.2–5.4
- Spec: §7.3 (duyệt cảnh chuẩn trước sản xuất hàng loạt); ADR 0013 mục 4 (3 hướng: A Ghibli màu nước — màu đầy hơn, cây cỏ mềm, trời vẽ tay; B mực nước trên giấy — nhiều khoảng trống kem, sương phân lớp, palette hẹp ngọc/chàm, nét mực; C kết hợp — nền chất B + cây cỏ chất A)
- Mục tiêu: Lead mở một trang local, chọn hướng (A/B/C) × cảnh (rừng bình minh có suối / biển hoàng hôn), chụp ảnh + quay video giống hệt nhau giữa các hướng.
- Việc: `tools/styleframes/` (dùng `vite` đã có trong devDependencies; **không** đụng `src/app`, không vào `next build`):
  1. `index.html` + `main.ts`: dựng scene từ module có sẵn — `terrain/` (tiles + mesh + pool, B2-011/016), `foliage/` (B2-018), `sky/` (B2-019), `post/paper.ts` (B2-002/003/005), `materials/ramp.ts`, `layout/` (vị trí cảnh). Nước: nếu `src/features/world/water/` chưa có thì bỏ qua và để TODO rõ (Lead thêm).
  2. `presets.ts`: 3 preset A/B/C chỉ là **tham số** (không fork shader): hệ số bão hòa/độ sáng cho palette màu tán/đất, số bậc ramp + soft, `setMist`, `setEdges` (ink on/off, bleed), mật độ cây, màu trời. Ghi lý do từng tham số theo taste brief. Màu chỉ suy ra từ `PALETTE` (pha/giảm bão hòa), không thêm màu ngoài palette.
  3. `shots.ts`: 2 cảnh với camera cố định + 1 đường camera chậm 15–20 s cho video: `forest-dawn` (gần khu First Light/Workshop, nhìn dọc suối, thấy lớp cây xa trong sương), `coast-dusk` (gần The Horizon / Quiet Shore nhìn ra biển). Vị trí lấy từ `ZONES`/`riverPointAt`.
  4. Query string `?preset=A&shot=forest-dawn&quality=High&t=0` (t = giây trên đường camera, để chụp tất định). Đặt `window.__frameReady = true` khi đã render ≥ 3 frame sau tải.
  5. Script `pnpm exec vite tools/styleframes` chạy dev server cổng 4190 (ghi trong README); **không** thêm script vào `package.json` (Lead làm).
  6. Overlay HTML nhỏ góc trái (ẩn khi `?clean=1`): preset, shot, FPS trung bình 2 s, draw calls.
- Được sửa: `tools/styleframes/**`, `tests/unit/tools/styleframes.test.ts`
- Test: presets chỉ dùng màu suy ra từ palette (HSV saturation ≤ 0,85); B có ink, A không; C dùng tham số nền của B + tán của A (so sánh trường); shots nằm trên terrain (camera y > worldHeight + 1,5); parse query an toàn (giá trị lạ → mặc định).
