## TICKET B2-185: lớp phủ nền rừng và đồng cỏ (hết mảng đất trống tối)

- Được sửa: `src/features/world/foliage/ground.ts` (trừ `createRock`, để nguyên), test `tests/unit/world/*ground*`.
- Đọc `_dirA-common.md`, `_asset-common.md`.

### Lead thấy trên ảnh

- `05-rung-first-light.webp`: nửa dưới khung hình là một mảng đất xanh đen trơn, không có gì. Dương xỉ/bụi chỉ vài cụm thưa.
- `01-duong-ven-bien.webp`: bãi cỏ bên phải đường là mảng nâu phẳng với vài túm cỏ lẻ loi.

### Việc

1. **Cỏ dày theo cụm:** túm cỏ mới 5–9 lá, cao 0,25–0,6 m, cong, ngọn sáng hơn gốc (`grass` → `grassDry` ở ngọn). Mật độ cao ở mép lối và mép suối, thưa dần ra xa; ven biển dùng nhiều `grassDry` hơn.
2. **Dương xỉ v2:** 6–9 lá kép xòe vòng cung, có lá con dạng răng cưa (hình học, không texture). Mọc thành đám 3–7 cây ở chỗ ẩm/gần suối và dưới tán.
3. **Hoa dại:** chấm `flower`/`paper` rất thưa (≤ 2 % số điểm), chỉ ở đồi và ven đường biển.
4. **Lá khô/đá dăm trên lối** giữ như hiện có, không chồng lên đường nhựa.
5. Tôn trọng `PATH_CLEARANCE` (cỏ thấp < 0,3 m được phép mọc mép lối, không giữa lối), không mọc dưới nước, không trên nền khu.
6. Giữ `GROUND_TRIANGLE_LIMIT` hoặc giảm; nếu cần tăng, không quá 25 % và ghi lý do. Dùng LOD theo khoảng cách nếu module đã có cơ chế ô/tile.

### Test

- Tam giác mỗi biến thể theo `_asset-common.md`; tổng ≤ giới hạn.
- Mật độ: ô 10 × 10 m sát lối ở rừng t = 0,15 có ≥ 25 vật phủ; ô xa lối ≥ 8.
- Không vật nào trong hành lang lối (trừ cỏ < 0,3 m ở mép), dưới nước, trên nền khu.
- Màu thuộc PALETTE; tất định.
