## Đợt 25: hướng A "Tranh chân thật" (Q-44, ADR 0013 bổ sung 2026-11-05)

Duy muốn world **rõ, chân thật, thực tế hơn**, nhưng vẫn giữ chất vẽ tay mềm. Đọc mục "Bổ sung 2026-11-05: đổi sang hướng Tranh chân thật" trong `docs/adr/0013-art-direction-painted-world-film-memories.md`.

### Ảnh tham chiếu của Duy

Lead mô tả lại 2 ảnh. Ảnh không có trong repo. **Không chép bố cục.**

- **Ảnh 1:**
  - Đường ven biển lúc giờ vàng.
  - Núi xanh cao, sườn dốc có vách đá, mây vờn quanh đỉnh.
  - Sườn cỏ xanh vàng lượn sóng.
  - Sát nước có bãi đá cuội và tảng đá lớn, thêm một dải cát; có chồng đá xếp.
  - Cột điện gỗ, dây võng giữa các cột.
  - Nắng ấm, trong, bóng đổ rõ.
- **Ảnh 2:**
  - Đường nhựa ven biển: vạch giữa màu vàng, vạch mép trắng; phía biển có hàng cột tiêu trắng đầu đỏ, cách đều.
  - Biển xanh ngọc, gần bờ nhạt hơn, ra xa đậm dần.
  - Trời xanh, mây cumulus trắng.
  - Núi đá dốc phủ cây xanh; xa xa có mũi đất đá; ven bờ có bãi đá.

### Quy tắc chung (bắt buộc)

- **Màu chỉ lấy từ `PALETTE`.** Bảng đã có thêm 14 màu tự nhiên: `skyHigh`, `skyLow`, `cloud`, `sunGold`, `seaShallow`, `seaDeep`, `grass`, `grassDry`, `rock`, `rockDark`, `sand`, `asphalt`, `laneYellow`, `laneWhite`.
  - Không sửa `palette.ts`. Cần màu mới thì ghi trong bàn giao.
- **Chất liệu:**
  - Low-poly vừa phải, vát mép, có biến thể hình dạng (không lặp y hệt).
  - Dùng shading ramp mềm sẵn có (`createRampMaterial`/`createPropMaterial`) và vertex color để biến màu.
  - **Không texture ảnh**, không PBR kim loại, không chữ, không logo.
- **Ngân sách §8 không được tăng trần:**
  - Vật lặp lại dùng instancing.
  - Mỗi module mới ≤ 4 draw call; ghi rõ số tam giác.
  - Không thêm pass hậu kỳ.
- **Tất định:** seed theo vị trí; không dùng `Math.random` lúc chạy.
- **Bố cục:**
  - Không đặt vật cứng trong hành lang đường đi (`PATH_CLEARANCE`).
  - Không đặt trên nền khu (`ZONES`, tính bán kính + lề).
  - Không đặt dưới nước, trừ đá ven bờ.
- **Quy ước trái/phải** theo hướng đi `f = (fx, fz)`:
  - phải = `(−fz, fx)`;
  - trái = `(fz, −fx)`.
  - Đoạn biển `t` 0,82–1: núi bên trái, vịnh bên phải.
- **Module mới:**
  - Export factory `create…(): { group, update?(dt), dispose() }`.
  - **Không** sửa `compose.ts` hay `index.ts`; Lead sẽ nối. Ghi trong bàn giao đoạn mã nối mẫu.
- **Test thay mắt bắt buộc** (sandbox không có trình duyệt): ngân sách tam giác/draw call, vị trí hợp lệ, màu thuộc PALETTE, tất định.
- **Điều kiện xong:** `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
