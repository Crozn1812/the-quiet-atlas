# Taste brief của Duy — nguồn gốc của mọi quyết định art

> Chép **nguyên văn** mục 5 của `quyet-dinh-duy-2026-11-04.md` (Duy quyết 2026-11-04). Không sửa nội dung mục này; chỉnh/khóa chi tiết (bảng màu, ngân sách asset) ghi ở art bible và ADR 0013.
> Ảnh tham chiếu: `docs/art-bible/refs/` (gitignore — không commit, không dùng pixel nào).

---

## 5. TASTE BRIEF CỦA DUY

### 5.1 Lời của Duy

- **Thích:** phim Ghibli, tranh màu nước, ảnh chụp film.
- **Ghét:** bóng bẩy, nổi bật, hào nhoáng, dễ thương, quá nhiều chữ, lòe loẹt.
- **Muốn người xem mang theo:** nhớ về Duy, nhớ về những ký ức trong web; mọi thứ đều có thể để lại dấu ấn.
- **Nhạc:** không khí như "Chốn xa" (Minh Tốc & Lam), chill nhẹ, piano cổ điển chậm. Chỉ là tham chiếu, không dùng bài này.

### 5.2 Khái niệm trung tâm (rút ra từ ảnh Duy gửi)

> **"Thế giới là một bức tranh. Ký ức là những tấm ảnh film."**

- **Thế giới 3D** mang chất tranh: mực nước + màu nước trên nền giấy kem, nhiều khoảng trống, sương phân lớp như núi trong tranh sơn thủy, con người nhỏ giữa thiên nhiên rộng.
- **Ký ức** (overlay, Atlas Journal, bưu thiếp cuối, ảnh trong nội dung) mang chất ảnh film: viền film, hạt, light leak nhẹ, số ngày tháng màu cam ở góc như máy film — đúng như ảnh film của Duy.
- **Suối là dải lụa uốn chữ S** — mô-típ lặp lại nhiều nhất trong bảng tham chiếu, và trùng với "suối là trục chính" của spec §2.1. Dùng mô-típ này ở cinematic mở đầu (nhìn từ trên cao xuống dòng suối uốn lượn như tranh, rồi hạ dần xuống lá, nước, sương), ở Atlas Journal và ở trang bìa overlay.

### 5.3 Bảng màu khởi điểm (Art Director chỉnh và khóa trong art bible)

| Vai trò | Màu | Hex gợi ý |
|---|---|---|
| Nền giấy, kem ngà | Giấy kem | `#EEE8D8` |
| Mực, chữ | Mực nâu đen | `#2B2A26` |
| Rừng sáng | Xanh ngọc rừng | `#5E8C6A` |
| Rừng sâu | Xanh rừng đậm | `#2F5446` |
| Sương, xa | Ngọc nhạt | `#A9C8B8` |
| Nước | Xanh lam nước | `#2E5E73` |
| Nước sâu, mực chàm | Chàm | `#23476B` |
| Hoàng hôn | Vàng hoàng hôn | `#E2B65C` |
| Điểm nhấn hiếm | Cam hoa (như hoa leo trong ảnh hàng rào gỗ) | `#D9822B` |
| Điểm nhấn rất hiếm | Đỏ son | `#B5432F` |

Quy tắc: nền kem và xanh chiếm phần lớn; cam/đỏ chỉ là chấm nhỏ (một bông hoa, con dấu, số ngày trên ảnh film). Không neon, không màu bão hòa mạnh.

### 5.4 Quy tắc art

- Vật liệu nhám, không phản chiếu bóng loáng; không PBR kim loại sáng bóng (kể cả chi tiết chrome của xe: cho mờ, ấm).
- Shading mềm kiểu tranh: ramp ánh sáng mềm, bóng màu xanh/tím nhạt thay vì đen.
- Lớp giấy (paper grain) và viền loang màu nước ở hậu kỳ — phải rẻ trên Iris Xe. Nét viền mực (outline) chỉ bật ở Balanced/High nếu đo đủ ngân sách.
- Sương phân lớp theo độ sâu như dãy núi trong tranh sơn thủy; xa thì nhạt dần về màu giấy.
- Nhiều khoảng trống; con người nhỏ trong khung cảnh lớn.
- **Bối cảnh Việt Nam, không phải Trung Hoa:** mượn kỹ thuật mực nước và bố cục từ tham chiếu, nhưng không dùng đình chùa, mái cong, chữ Hán. Cảnh vật lấy từ chính ảnh của Duy: rừng thông kiểu Đà Lạt, đồi cỏ xanh, hàng rào gỗ có hoa leo, căn nhà cũ phủ dây leo, biển.
- **Công nghệ hòa vào thiên nhiên** (khớp "rừng + nước + công nghệ" của mascot): tuabin gió trên đồi xanh như ảnh film của Duy, công trình cũ bị dây leo phủ. Hợp với The Roots, The Horizon.
- UI im lặng: chữ ít, kiểu tạp chí; chuyển động chậm, không nảy, không bật tung kiểu game mobile.

### 5.5 Overlay và giao diện (từ bảng tham chiếu layout)

- Overlay là trang tạp chí: tiêu đề lớn, nhiều khoảng trắng, một hình minh họa màu nước tràn mép, chữ ít.
- Hình minh họa: nét chì/mực tay + mảng màu nước xanh, điểm cam rất ít.
- Ảnh trong nội dung đặt trong khung ảnh film (viền, hạt, ngày tháng cam).
- **Chỉ lấy bố cục, không lấy phong cách nhân vật** của các mẫu slide có nhân vật hoạt hình màu sắc rực rỡ — phong cách đó thuộc nhóm "dễ thương, lòe loẹt" Duy ghét.
- Chữ tiếng Việt phải đủ dấu (font đã tự host); tiêu đề có thể dùng serif tạp chí.

### 5.6 Nhân vật (theo ảnh thật của Duy)

- Tóc đen ngắn, hơi rối tự nhiên, mái lòa xòa.
- Kính tròn gọng kim loại mảnh, màu vàng nhạt/bạc.
- Dáng người mảnh, tỷ lệ người thật, không chibi.
- Trang phục chính (đúng spec): sơ mi trắng/kem rộng, xắn tay, quần short đen, tất trắng, giày vải xanh lá. Áo trơn, không logo.
- Phụ kiện: túi vải tote màu kem.
- Biến thể có thể dùng cho cảnh ending/biển chiều: áo khoác hoodie xám + khăn quàng (như ảnh trên đồi gió) — Lead quyết.
- Không làm khuôn mặt giống người thật đến mức nhận diện; giữ cách điệu nhưng bắt được tinh thần: hiền, hay cười, hay nhìn xa.

### 5.7 Xe Suzuki GD110 (theo ảnh)

- Thân trắng, yên đen, vành nan, ống xả chrome (làm mờ, ấm), gương tròn, baga sau.
- Phụ kiện: mũ bảo hiểm cổ điển có kính phi công treo trên xe, túi tote treo ghi đông.
- Không huy hiệu, không chữ trên xe.
- **Ghi đông:** spec ghi "scrambler cao", ảnh thật trông như ghi đông thường. Đưa vào DUY_QUEUE; trong lúc chờ, làm theo ảnh thật.

### 5.8 Gợi ý dàn cảnh từ ảnh của Duy (Lead tự quyết có dùng hay không)

- **Reflection** (secret): một tấm gương tròn giữa vòm dây leo có hoa cam, như ảnh hàng rào gỗ.
- **The Quiet Shore**: ghế gỗ, hàng rào gỗ có hoa leo, xe dựng bên cạnh.
- **The Horizon**: đồi cỏ xanh có tuabin gió, nhìn ra biển.
- **Unmarked Road**: lối đi xuyên qua một công trình bê tông cũ phủ dây leo, ánh sáng rọi qua song sắt từ trên xuống. Không có graffiti (quá ồn).
- **Ký ức**: Atlas Journal đóng dấu mộc; bưu thiếp cuối là một "ảnh film" ghép các khu đã ghé. Mọi thứ chỉ tồn tại trong memory, không lưu.

### 5.9 Ảnh cá nhân

- Ảnh của Duy chỉ là tham chiếu nội bộ. Lưu ở `docs/art-bible/refs/` và **thêm vào .gitignore** nếu repo public. Không đưa vào `public/`.
- Muốn dùng ảnh thật trên web (About, The Quiet Shore) thì phải hỏi Duy trước: ảnh nào được dùng, ai chụp (cần ghi credit), và xóa EXIF/GPS khi xuất.
