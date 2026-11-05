## TICKET B2-173: núi ven biển cao hơn, có đỉnh, nhiều lớp

- Được sửa: `src/features/world/terrain/height.ts`, các test địa hình và bờ biển.
- Đọc `_dirA-common.md`. Quy ước trái/phải theo B2-152b.

### Lead thấy trên ảnh

Núi bên trái chỉ là một sườn dài cao khoảng 45 m, đỉnh phẳng. Ảnh tham chiếu của Duy có núi cao dốc, đỉnh rõ, nhiều lớp núi xa.

### Việc

1. Phía sau sườn hiện có (cách đường ≥ 150 m, bên trái), đoạn `t` 0,82–1:
   - Dựng **1 đỉnh chính cao 110–150 m** so với mặt đường, vai núi dốc 30–40°, có vách.
   - Phía sau là **1–2 lớp núi xa thấp hơn** (70–100 m), để tạo chiều sâu.
2. **Xa hơn về cuối vịnh** (bên phải, phía trước): một mũi đất đá dốc, nhô ra biển.
3. **Ràng buộc:**
   - Sườn gần đường của B2-152b/B2-158 giữ nguyên.
   - Không đụng các khu (`ZONES`), đường đi, cửa sông.
   - Độ dốc sườn trong 40 m kể từ đường vẫn ≤ 35°.
   - Hàm thuần, tất định.

### Test

- Có đỉnh ≥ 110 m trong vùng chỉ định.
- Mũi đất nằm bên phải phía trước.
- Các test cũ pass. Đổi điểm đo thì ghi lý do.
