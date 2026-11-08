## TICKET RD-01: lan can cuối đường + tựa lan can ngắm hoàng hôn + lan can dọc đường biển

- Duy (2026-11-08). Đọc: `_ux-common.md`, `_review-common.md` (cổng 4420), `_graphics-common.md`, spec §6 (tương tác E, a11y), `docs/art-bible/` (hướng R1: khối mặt phẳng, palette).
- Được sửa: `src/features/world/road/*`, `src/features/world/props/*` (lan can), `src/features/world/character/*` (tư thế tựa), `src/features/interaction/*`, `src/features/world/index.ts` (chỉ phần nối tương tác/camera của lan can), `src/i18n/*` (nhãn vi/en), `tools/assets/blender/` nếu dựng GLB, `public/world/props/`, `assets/LICENSES.csv`, test unit + e2e.

### Hiện trạng
Cuối con đường ở Last Postcard, mặt đường **thu hẹp rồi biến mất** vào bãi cát (`docs/showcase/29-hoan-thien/ingame-8-khu.webp` ô 8). Đường ven biển dài, đơn điệu.

### Việc
1. **Cuối đường:** đường giữ đủ bề rộng tới hết, kết thúc bằng **lan can chắn** (thép mạ kẽm sóng đôi hoặc rào gỗ–thép kiểu đường ven biển Việt Nam, sơn trắng–đỏ nhạt ở trụ, không logo/chữ), ngang hết mặt đường + vai đường, sau lan can là bờ dốc xuống biển. Có collider (không đi xuyên).
2. **Tương tác "Tựa lan can"** (E, nhãn vi "E — Ngắm biển" / en "E — Look out to sea"):
   - Nhân vật đi vào chỗ đứng trước lan can, quay mặt về phía mặt trời/biển, **hai tay đặt lên thanh lan can**, thân hơi nghiêng trước (pose bằng rig hiện có, như B2-237 tư thế lái xe).
   - Camera chuyển mượt sang khung sau-lưng-hơi-chếch, thấp, thấy nhân vật + đường chân trời + mặt trời (ẩn dock/hint như cinematic). Có thể thở nhẹ (idle) nếu không reduced-motion.
   - Thoát: E lần nữa, Esc, hoặc bất kỳ phím di chuyển → trở lại điều khiển, camera về bình thường. Không lưu trạng thái.
   - Không chặn ending/bí mật "unwritten-page" và hộp thư Last Postcard (đặt lan can ở mút đường, ngoài bán kính tương tác của chúng).
3. **Lan can dọc đường ven biển:** các đoạn lan can ở phía biển của đường (Quiet Shore → Last Postcard), có khoảng hở ở lối xuống bãi/chỗ dừng, xen với cột tiêu hiện có; InstancedMesh, ≤ 4 draw call, tam giác theo `asset-budgets.md`, không cản camera (thêm vào vật cản camera nhưng mỏng).

### Nghiệm thu
- Ảnh: cuối đường (gameplay), khung tựa lan can (High), 2–3 góc đường ven biển có lan can; 8 khu luma ±0,03.
- e2e mới: tới Last Postcard (`__tqaJourney.goTo("last-postcard")`), đi tới lan can, E → trạng thái tựa (`data-world-lean="on"` hoặc tương đương) → E/Esc thoát; bàn phím-only được.
- Gate, `load-budget` ≤ 6 s, `cpu-compare` ≤ main + 10 ms/s.

### Vòng 1 (Lead): tự nối và tự kiểm tra

`_common-b2.md` đã sửa: ticket này **được sửa `src/features/world/index.ts` và `tests/e2e/`**. Tự nối theo đoạn mẫu trong bàn giao, chỉnh bờ dốc sau lan can, viết e2e lan can, rồi build + chụp ảnh (cuối đường, khung tựa lan can ở High, 2–3 góc đường ven biển) + `ingame-shots` 8 khu + `luma.mjs`, chạy `pnpm exec playwright test <spec lan can>`. Dán kết quả.
