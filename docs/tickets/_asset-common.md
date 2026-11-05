## Đợt 26: sản xuất asset kỹ (B2 công đoạn 2) — quy tắc chung

Đọc thêm `_dirA-common.md` (hướng A "Tranh chân thật"). File này **khóa** các quy tắc asset; art bible (`docs/art-bible/`) sẽ chép lại từ đây.

### Mục tiêu nhìn

- Mỗi vật phải **đọc được chất liệu ở 5–15 m**: gỗ có thớ/vát mép, đá có mặt vỡ và cạnh sáng, lá thành cụm nhỏ chứ không phải khối lục giác.
- Bóng tối nhất của vật trong cảnh **không đen**: luma ≥ 0,06 khi ngược sáng (bóng ngả xanh/tím theo taste §5.4).
- Không có hai bản sao giống hệt nhau đứng cạnh nhau: ≥ 3 biến thể hình dạng + xoay/scale/hue theo seed vị trí.
- Không bóng bẩy, không dễ thương, không bão hoà mạnh. Cam/đỏ chỉ là chấm nhỏ.

### Kỹ thuật (khóa)

- **Hình học thủ tục trong TypeScript** (`BufferGeometry`), tất định theo seed. Không file ảnh, không GLB mới (trừ nhân vật, xe đã có pipeline Blender).
- Vật liệu: `createRampMaterial` / `createPropMaterial` / material sẵn có của module; biến màu bằng vertex color. Không PBR kim loại, không texture.
- Vật lặp lại: `InstancedMesh`. Mỗi module ≤ 4 draw call.
- **Ngân sách tam giác mỗi biến thể** (theo `tools/assets/budgets.json`, không nâng):
  - cây lá rộng ≤ 1 500, thông ≤ 1 200, bụi/dương xỉ ≤ 300, cỏ ≤ 60;
  - đá nhỏ ≤ 200, tảng lớn ≤ 400;
  - đồ gỗ (khúc gỗ, ghế, hàng rào 1 nhịp) ≤ 600; prop khu ≤ 2 000 mỗi cụm;
  - xe ≤ 8 000.
- **Tổng tam giác cả world ở mức High không tăng quá 25 %** so với trước ticket. Ghi số trước/sau trong bàn giao (đo bằng test Node).
- **Thời gian dựng:** hàm tạo geometry mới chạy trên Node không chậm hơn bản cũ quá 20 ms. Thời gian vào chơi hiện là 5,77 s, trần 6 s; không được làm vượt.
- Màu chỉ lấy từ `PALETTE` (có thể `lerp` giữa hai màu PALETTE).

### Bàn giao bắt buộc

- File đã sửa, số tam giác từng biến thể (trước → sau), số draw call.
- Output dòng tổng kết của `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test`.
- Nếu là module mới: đoạn mã nối mẫu ≤ 15 dòng cho Lead.
