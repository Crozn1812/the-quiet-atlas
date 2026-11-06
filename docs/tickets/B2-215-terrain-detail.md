## TICKET B2-215: mặt đất có chi tiết ở tầm trung và xa

- Đọc `_finish-common.md`. Được sửa: `src/features/world/materials/ramp.ts` (**chỉ** biến thể terrain/continuous) hoặc shader terrain trong `terrain/mesh.ts` nếu terrain có material riêng, test terrain. Không đổi hình học terrain.

### Vấn đề

- Rừng: nửa dưới khung hình là mảng xanh đen đều. Đồi: mảng xanh/vàng trơn. Thiếu chi tiết tầm 5–40 m.

### Việc

1. Thêm **noise thủ tục world-space trong shader** (2 tầng: 3–6 m và 0,6–1,2 m) điều chế màu ±10 % và hue nhẹ (về `grassDry`/`forestDeep`), giảm dần theo khoảng cách để không sạn ở xa.
2. Rừng: thêm "đốm nắng" mờ trên nền theo hướng mặt trời (noise ngưỡng mềm, ±8 % sáng) — không cần shadow map thêm.
3. Không texture ảnh; không thêm pass.

### Test

- CPU mô phỏng: trong ô 20 × 20 m ở rừng t = 0,15, độ lệch chuẩn luma tăng ≥ 1,5 lần so với hiện tại; trung bình không đổi quá 5 %.
- Ở 200 m, biên độ noise ≤ 30 % của gần.
