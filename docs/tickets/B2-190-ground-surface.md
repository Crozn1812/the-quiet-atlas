## TICKET B2-190: mặt đất có chất (lối mòn, rêu, đất ẩm, cỏ đồi)

- Được sửa: `src/features/world/terrain/mesh.ts` (**chỉ** phần tô vertex color; giữ nguyên quy tắc cát/đáy biển chỉ ở nước thật đã có), test `terrain-mesh`, `coast`.
- Đọc `_dirA-common.md`, `_asset-common.md`.

### Lead thấy trên ảnh

- Rừng (`05`): nền là một mảng xanh đen đều, không thấy lối mòn, không có đốm đất/rêu/lá.
- Ven biển (`01`): bãi bên phải đường nâu xám trơn.

### Việc

1. **Lối mòn trong rừng:** dọc `PATH` có dải đất nâu ấm (`sand` pha `rockDark`) rộng 1,2–2 m, mép loang không đều, chỗ bị cỏ lấn; không áp lên đường nhựa ven biển.
2. **Nền rừng:** pha rêu xanh (`forestDeep`/`grass`), đất ẩm tối gần suối, đốm lá khô (`grassDry` pha `dusk` ≤ 10 %) theo noise 2 tầng (6–10 m và 1–2 m). Độ sáng trung bình nền rừng không giảm.
3. **Đồi và bãi ven biển:** cỏ xanh vàng chuyển dần sang `grassDry` gần biển; mảng đất trơ/đá lộ ở chỗ dốc (dùng độ dốc đã có).
4. Không thêm attribute, không texture; giữ số đỉnh lưới.

### Test

- Mẫu trên tâm lối rừng (t = 0,1; 0,2; 0,3) có R/G cao hơn nền rừng cách lối 6 m ≥ 15 %.
- Trên đường nhựa ven biển: màu terrain không đổi so với bản cũ (đường che, nhưng giữ để tránh lộ mép).
- Độ biến thiên luma của nền rừng trong ô 20 m (độ lệch chuẩn) ≥ 2 lần bản cũ.
- Quy tắc cát/đáy biển cũ vẫn pass.
