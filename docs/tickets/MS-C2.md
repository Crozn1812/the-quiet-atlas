## TICKET MS-C2 — Hình nộm chứng chỉ: lên "gần thực" + khôi phục test bất biến của khu

- Lane / milestone: L3 World / hướng C. Tiếp theo MS-C (`00e1850`). Đọc `docs/tickets/MS-C.md` (ý Duy, luật không bịa) và ảnh Lead đã duyệt: `tools/assets/blender/milestones-handoff.md`, ảnh trong handoff.
- Tham chiếu cảm hứng: `docs/art-bible/refs/milestones-shards-duy.png` (chỉ cảm hứng: không chép khuôn mặt, bố cục, chữ; áo trơn không logo).

### 1. Hình (Lead review MS-C: đúng ý, chưa đạt "gần thực")
- **Thân:** hiện là khối vuông kiểu ma-nơ-canh gỗ. Cần dáng người thật: vai, ngực, eo, nếp áo sơ mi và quần ống rộng, giày; bề mặt mịn (subdivision/bake normal từ bản high-poly trong Blender), tay chân tròn tự nhiên. Vẫn tư thế đang bước.
- **Mặt:** bỏ nét cười vẽ kiểu hoạt hình; khuôn mặt điêu khắc trung tính, mắt khép nhẹ nhìn xuống, kính tròn mảnh. Không nhận dạng người thật cụ thể nào ngoài tinh thần "Duy".
- **Chất liệu:** sứ/đá cẩm thạch trắng ấm, roughness cao, SSS giả nhẹ, AO; **mạng vết nứt vàng kintsugi** chạy khắp thân (vai, tay, chân), đậm hơn quanh các mảnh đã hàn, phát sáng nhẹ (bloom High).
- **Mảnh đã đạt** (CCNA, VTI DevOps): là **mảnh kính dày** gắn vào thân, mép vát bắt sáng, viền vàng; chữ **khắc mờ** (trắng/vàng nhạt, khắc chìm), không phải chữ đen in đậm.
- **Mảnh dự định** (AWS SAA, Linux/CEH): kính Fresnel trong, mép sáng, xoay chậm theo dải vàng; **khe trống trên thân đúng hình mảnh**, mép khe viền vàng sáng, lòng khe tối sâu (rỗng), không phải lỗ vuông.
- **Dải sáng:** sáng hơn, có vài hạt lấp lánh dọc dải (points, một draw).
- Chữ và số mảnh vẫn **chỉ** từ `milestoneCertificates()`; không thêm IELTS/Français/SQL…

### 2. Test (MS-C đã xoá 17 test bất biến của khu — phải khôi phục tương đương cho tượng mới)
Khôi phục/viết lại cho tượng mới các bất biến: đặt trên địa hình thật; plinth cách hành lang 2–6 m và trong tầm E ở mép; collider plinth + mục tiêu tương tác giữ chỗ; lặp lại y hệt cùng seed; dispose mỗi geometry/material sở hữu đúng một lần, giữ vật liệu dùng chung; dựng khu ≤ 450 ms CPU Node; không di chuyển transform/geometry khi update trong reduced motion; nhìn thấy tượng từ điểm đến và đường mòn 10–30 m; xoay về phía Roots 25°, mảnh dự định cách nhau ≥ 0,5 m; chữ khắc lấy đúng từ dữ liệu. Không nới ngưỡng cũ.

### Ngân sách và phạm vi
- Tổng so với main trước MS-C: tam giác ≤ +25 000 High, draw ≤ +4, asset ≤ 1,5 MB deferred, CPU ABBA ≤ +10 ms/s.
- Được sửa: `src/features/world/zones/milestones*.ts`, `public/world/milestones/`, `tools/assets/blender/milestones-*`, `assets/LICENSES.csv`, `tests/unit/world/zones/milestones*.test.ts`.
- Không được sửa: `index.ts`, `character/**`, `post/**`, `src/content/**`, khu khác.
- Xong: gate PASS; build một lần; e2e world `--workers=2` config mặc định 43/43; ảnh High trước/sau 3 góc (front, back, sockets) + Low + clip 10 s; bảng tam giác/draw/byte. Không commit.
