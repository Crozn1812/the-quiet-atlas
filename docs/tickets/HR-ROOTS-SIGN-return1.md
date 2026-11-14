## HR-ROOTS-SIGN — trả lại vòng 1 (Lead)

Lead đã rebase W-B lên main mới nhất (có HR-SEA). Hướng đúng (ván gỗ, chữ cỡ vừa, nội dung từ content), nhưng:

1. **Chữ gần như không đọc được**: chữ kem nhạt trên gỗ nâu cam, tương phản quá thấp. Làm chữ **khắc lõm tối** (rãnh tối + viền sáng mảnh phía dưới) hoặc **sơn trắng ngà đục** có bóng tối nhẹ; đọc rõ từ ~4–5 m ở High và Low. Kiểm tương phản: độ sáng chữ/nền chênh ≥ 4.5:1 trên ảnh chụp.
2. **Vân gỗ giống vỏ thông** (ảnh vỏ cây định hướng lại): dùng texture **ván gỗ xẻ CC0** thật (Poly Haven/ambientCG "wood planks", "weathered wood"; ghi LICENSES.csv) hoặc vân gỗ dọc thớ tạo trong shader; màu gỗ phong hóa xám nâu, mép ván sứt, đinh/chốt gỗ, rêu nhẹ ở chân cột.
3. **JS gzip +49,6 KB**: không nhúng font/texture vào bundle JS. Dùng font tự host sẵn có ở `public/fonts/` (nạp qua FontFace/CSS sau Enter World) và texture là file public deferred. Ghi lại byte JS sau sửa.
4. Thứ tự bảng: giữ đúng thứ tự trong content (bản cũ là AWS, Azure, Languages, Tools, Network…); ghi rõ nếu content thật sự đổi thứ tự.

Được sửa thêm: `public/world/roots/` (texture gỗ), `assets/LICENSES.csv`. Build 1 lần. Xong: gate, e2e world 43/43, ảnh trước/sau High cùng góc + 1 ảnh ở 5 m + Low. Không commit.
