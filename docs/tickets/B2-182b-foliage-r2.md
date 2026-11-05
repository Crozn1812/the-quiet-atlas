## TICKET B2-182b: cây vòng 2 (tán mềm, thân màu vỏ thật, không đen khi ngược sáng)

- Được sửa: `src/features/world/foliage/shapes.ts` (`createBroadleafCrown`, `createTreeTrunk`, `mossColor`), `src/features/world/foliage/instances.ts` (màu thân, shader lá), test foliage liên quan.
- Đọc `B2-182-broadleaf-tree-v3.md`, `B2-183-foliage-light.md` (cả hai đã merge), `_dirA-common.md`, `_asset-common.md`.
- Ảnh Lead chụp sau merge: `docs/showcase/26-asset-ky/lead-review/01-r1-rung.webp` (rừng t = 0,15), `02-r1-bien.webp` (biển t = 0,86).

### Lead thấy (test đều PASS nhưng hình chưa đạt)

1. **Tán lá là các khối kim cương/bát diện nhọn**, rời rạc như chùm đá quý. Cần cụm lá **tròn mềm, chồng lấn nhau** (icosahedron chia 1 lần hoặc cầu thấp, dẹt theo trục y 0,7–0,85, normal làm mượt theo tâm cụm để ramp đổ bóng tròn), các cụm chạm/lấn nhau thành khối tán liền có mép răng cưa — không phải chấm rời.
2. **Thân cây vẫn màu kem sáng** (luma ảnh khoảng 0,7) ở cả rừng và sườn núi. Thân thật nằm ở `createTreeTrunk` + màu instance trong `instances.ts`, không phải phần gỗ trong tán. Luma màu cuối của thân (sau material × vertex color, trước ánh sáng) 0,12–0,22, nâu xám; kiểm cả translucency B2-183 không cộng vào gỗ.
3. **Cây sườn núi ven biển vẫn xanh đen** khi ngược nắng. Nâng ngưỡng: luma lá ngược sáng ≥ **0,12** (không phải 0,06) ở t = 0,86 và t = 0,93; mặt khuất ngả xanh rêu/xanh lam, không đen.
4. Thân không được sáng hơn tán.

### Test

- Crown: mỗi cụm có ≥ 40 % đỉnh có normal lệch < 35° so với hướng từ tâm cụm (mượt tròn); không cụm nào cách hết các cụm khác (mỗi cụm giao ít nhất 1 cụm khác).
- Màu thân cuối: luma 0,12–0,22 cho mọi đỉnh thân không rêu.
- Mô phỏng CPU lá ngược sáng t = 0,86/0,93: luma ≥ 0,12; lá thuận sáng không vượt bản trước quá 10 %.
- Test cũ pass (fingerprint đổi thì ghi lý do).
