## TICKET B2-037 — Bờ biển hữu cơ: đường bờ cong, bãi cát, cửa suối hòa vào biển

- Trạng thái: Assigned → Codex, đợt 16, nhánh `lane/B2-037`
- Đọc trước: `docs/tickets/_common-b2.md`; `docs/art-bible/taste.md` §5.2–5.3; spec §2.1 (khu The Horizon / Last Postcard / Quiet Shore)
- Vấn đề (Lead thấy ở style frame `coast-dusk`, B2-031): vùng ven biển phẳng đúng cao độ 0 (`coastWeight` kéo mọi địa hình về `riverLevel` = 0); mặt biển là hình chữ nhật bắt đầu bằng **một cạnh thẳng** ở `z` cửa sông; dải suối (`ribbon.ts`) kết thúc bằng **mép cụt** trên đất bằng. Nhìn từ trên cao ra biển không có bờ, chỉ có đường kẻ thẳng.
- Mục tiêu: đứng ở Last Postcard nhìn ra biển thấy: đất thoải xuống → **bãi cát** hẹp màu kem ấm → mép nước **cong, không thẳng** → biển; suối mở rộng và tan vào biển, không có mép cụt.

### Việc
1. `terrain/height.ts`: trong dải ven biển (khoảng `z` < −760), địa hình **thoải dần xuống dưới mực biển 0** theo một đường bờ cong (nhiễu seeded theo `x`, biên độ 15–35 m, bước sóng 60–120 m), dốc bãi khoảng 0 → −2,5 m trong 25–40 m. Đồi (`hills`) tiếp tục mờ dần về phía bờ như hiện tại. Hàm vẫn thuần (pure, không random state), vẫn liên tục (không bậc).
2. **Ràng buộc cứng**: mọi điểm trên đường đi bộ (`pathPointAt`, t ∈ [0,1]) và trong bán kính mọi zone (`ZONES`) phải có `worldHeight ≥ 0,4` m (người chơi không lội biển). Cửa suối: `waterLevelAt` giữ nguyên (đã nối ra 0).
3. `water/sea.ts`: mặt biển bắt đầu **sâu vào đất** (ví dụ 80 m phía thượng nguồn của cửa sông) để giao tuyến địa hình × mặt nước 0 chính là đường bờ cong; giữ 800 m ra khơi. Không thêm draw call.
4. `water/ribbon.ts`: đoạn cuối suối (t > 0,96) **mở rộng dần** và kết thúc dưới mặt biển (hạ 0,05 m ở hàng cuối) để không còn mép cụt nhìn thấy.
5. `terrain/mesh.ts`: thêm thuộc tính `color` cho vertex: màu bãi cát cho đất cao 0–0,9 m (pha mềm 0,9→1,6 m về màu trắng = không đổi màu vật liệu). Màu cát chỉ suy từ `PALETTE` (ví dụ `paper` lerp `dusk` 0,22) — không thêm màu ngoài palette. Vật liệu đất bật `vertexColors` ở chỗ tạo vật liệu đất **trong file được sửa** (nếu vật liệu tạo ở ngoài vùng, ghi đoạn code mẫu cho Lead).

### Được sửa
`src/features/world/terrain/height.ts`, `src/features/world/terrain/mesh.ts`, `src/features/world/water/sea.ts`, `src/features/world/water/ribbon.ts`, `tests/unit/world/river-terrain.test.ts`, `tests/unit/world/water.test.ts`, `tests/unit/world/terrain-mesh*.test.ts` (nếu có), file test mới `tests/unit/world/coast.test.ts`.

### Test bắt buộc (`tests/unit/world/coast.test.ts`)
- Đường bờ cong: lấy mẫu 40 điểm `x` dọc bờ, tìm `z` nơi `worldHeight` cắt 0; độ lệch chuẩn của `z` ≥ 8 m (không phải đường thẳng).
- Đường đi + zone ≥ 0,4 m (mẫu dày: 2000 điểm path + lưới trong từng zone).
- Liên tục: chênh cao giữa hai mẫu cách nhau 0,5 m ≤ 0,6 m trên toàn dải ven biển.
- Có biển phía trước Last Postcard: điểm 120 m ra khơi theo hướng biển có `worldHeight < −1`.
- Vertex color: đỉnh cao 0,3 m có màu khác trắng; đỉnh cao 5 m là trắng (1,1,1).
- Các test cũ của terrain/water/foliage/compose vẫn pass (sửa giá trị kỳ vọng chỉ khi đó là hệ quả trực tiếp của đường bờ mới; ghi lý do trong bàn giao).

### Điều kiện xong
`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` exit 0 — dán dòng tổng kết. Không commit.

### Bàn giao
Danh sách file, output lệnh, giới hạn còn lại, và (nếu cần) đoạn code ≤ 15 dòng để Lead bật `vertexColors` ở nơi tạo vật liệu đất (`scene/compose.ts`, `tools/styleframes/main.ts`).
