# ADR 0013 — Hướng art: "Thế giới là một bức tranh. Ký ức là những tấm ảnh film."

- Trạng thái: **Accepted (hướng)**; style frame **chưa chọn** — chờ vòng duyệt gu (mục 4)
- Nguồn: taste brief của Duy (`docs/art-bible/taste.md`, chép nguyên văn mục 5 của quyết định 2026-11-04)
- Thay thế: `docs/art/direction-notes.md` (nháp đợt 10) — xem mục "Khác biệt" bên dưới

## Quyết định

1. **Hai chất liệu tách bạch:**
   - **Thế giới 3D = tranh:** mực nước + màu nước trên nền giấy kem, nhiều khoảng trống, sương phân lớp theo độ sâu kiểu sơn thủy, người nhỏ giữa thiên nhiên rộng.
   - **Ký ức = ảnh film:** overlay, Atlas Journal, bưu thiếp cuối, ảnh trong nội dung có viền film, hạt, light leak nhẹ, ngày tháng cam ở góc.
2. **Mô-típ trục:** suối là dải lụa uốn chữ S (khớp spec §2.1 "suối là trục chính"). Dùng ở cinematic mở đầu (từ cao xuống), Atlas Journal, bìa overlay.
3. **Bảng màu khởi điểm** (Art Director khóa trong art bible sau vòng duyệt): giấy kem `#EEE8D8`, mực `#2B2A26`, rừng sáng `#5E8C6A`, rừng sâu `#2F5446`, sương `#A9C8B8`, nước `#2E5E73`, chàm `#23476B`, hoàng hôn `#E2B65C`, cam hoa `#D9822B` (hiếm), đỏ son `#B5432F` (rất hiếm). Không neon, không bão hòa mạnh.
4. **Vòng duyệt gu bắt buộc trước sản xuất hàng loạt:** 3 style frame trong engine (A Ghibli màu nước / B mực nước trên giấy / C kết hợp — Lead đề xuất C), cùng 1 góc rừng bình minh có suối + 1 góc biển hoàng hôn; mỗi hướng 2 ảnh + 1 video 15–20 s + FPS đo trên Iris Xe; kèm 1 mẫu overlay tạp chí + 1 mẫu ảnh film. Duy chọn/trộn → khóa art bible → cảnh chuẩn T10 → Duy duyệt → mới sản xuất hàng loạt. Nhân vật + xe duyệt riêng (turnaround 3 góc).
5. **Kỹ thuật (quyết định của Lead, đo trước khi khóa):**
   - Vật liệu không PBR kim loại; shader ramp mềm (toon ramp 3–4 bậc, làm mềm), bóng màu xanh/tím nhạt.
   - Hậu kỳ một pass gộp: paper grain (texture tile nhỏ) + loang mép màu nước + sương theo độ sâu. Outline mực chỉ ở Balanced/High nếu đo đủ ngân sách. Low: chỉ fog màu giấy + grain tĩnh.
   - Pipeline asset: Blender headless (bpy) → glTF → gltf-transform (meshopt + KTX2). Ngân sách từng asset ghi trong art bible.
6. **Bối cảnh Việt Nam**, không đình chùa/mái cong/chữ Hán. Cảnh lấy từ ảnh của Duy: rừng thông Đà Lạt, đồi cỏ, hàng rào gỗ hoa leo, nhà cũ dây leo, biển, tuabin gió.
7. **Pháp lý tham chiếu:** ảnh Pinterest (nhiều ảnh có dấu AI hoặc ký hiệu tác giả ©DNA2725, SashaArt) và ảnh cá nhân **không** dùng pixel nào; lưu ở `docs/art-bible/refs/` đã gitignore. Không logo Chiefs, không logo/chữ Suzuki.

## Khác biệt so với `direction-notes.md`

- Ghi đông GD110: **scrambler** (Duy xác nhận 2026-11-04, Q-25 — đúng như xe thật và spec).
- Thêm khái niệm hai chất liệu (tranh/film), bảng màu hex, quy tắc UI im lặng, nhân vật chi tiết (kính vàng nhạt/bạc, tote, quần short đen, giày vải xanh lá).

## Hệ quả

- Ảnh nền Welcome 2D (ADR 0009) sẽ được vẽ lại theo bảng màu khi art bible khóa — chỉ khi không làm đỏ gate Lighthouse/ngân sách JS.
- Art Director (subagent) review mọi ảnh/video showcase theo `taste.md` + art bible.

## Bổ sung 2026-11-04: câu trả lời Q-25…Q-28

- **Xe**: ghi đông scrambler; theo ảnh: thân trắng, yên đen, vành nan, gương tròn, baga sau, mũ bảo hiểm có kính phi công đặt trên bình, túi tote treo ghi đông. Không chữ/huy hiệu.
- **Âm thanh**: không có bản thu của Duy → chỉ nhạc CC0/giấy phép rõ ràng (piano chậm, chill).
- **Ảnh thật trên web**: ảnh có credit rõ → dùng (khung ảnh film, xóa EXIF/GPS, che/loại logo); ảnh không rõ người chụp → minh họa màu nước do Lead vẽ dựa trên ảnh gốc. Mọi ảnh dùng trên web: ghi nguồn trong `assets/LICENSES.csv`.
- **Ảnh tham chiếu đã có trên đĩa** (`refs/`, gitignore) — chỉ mục ở `refs/README.md`.
