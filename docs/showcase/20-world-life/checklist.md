# Showcase đợt 18–20: world có sự sống (nhân vật, xe, dịch chuyển, secrets, mascot, âm thanh)

Duy chấm từng dòng **giữ / sửa / bỏ**. Nếu chọn sửa, ghi chú thêm.

Nguồn ảnh:
- Ảnh `1-`, `2-`: chụp từ bản build tĩnh thật, Edge, 1600×900.
- Ảnh `10-` đến `18-`: chụp từ trang trưng bày asset (`tools/styleframes/assets.html`). Cùng ánh sáng, chất tranh và hướng C như world, đặt trên nền đất trống để dễ nhìn.

## Ảnh

| File | Nội dung |
|---|---|
| `1-first-light.webp` | Điểm xuất phát: nhân vật đã rig, biển vẽ tay, xe GD110 dựng cạnh, cỏ và đá, nguồn suối thon. Mascot nhỏ bay phía trên nhân vật; câu gợi ý đầu tiên của mascot hiện trên hint E |
| `2-teleport-chooser.webp` | Hộp "Đi tới…" khi bấm E tại biển chỉ đường (khu đang đứng bị làm mờ) |
| `10-asset-all.webp` | Toàn bộ asset mới xếp một hàng |
| `11-` … `14-` | 4 mốc bí mật: vòm gương dây leo, chuông gió, lối đá mờ, ghế gỗ hướng biển |
| `15-`, `16-` | Biển chỉ đường, bàn làm việc |
| `17-asset-gd110.webp` | GD110: thân trắng, yên đen dài, ghi đông scrambler, đèn tròn, baga, mũ kính hổ phách. Không chữ, không logo |
| `18-asset-mascot.webp` | Mascot: giọt nước, 2 lá non, vòng sáng vàng mảnh |

## Chấm

| # | Hạng mục | Hiện tại | Giữ / Sửa / Bỏ | Ghi chú |
|---|---|---|---|---|
| 1 | Nhân vật trong world | Mô hình D-23, 19 xương; đứng thở, đi, chạy chậm trộn theo tốc độ | | |
| 2 | Biển chỉ đường và bàn | Gỗ mộc vẽ tay. Biển là mũi tên không chữ (chữ nằm ở hint) | | |
| 3 | Dịch chuyển | E tại 1 trong 8 biển → hộp chọn → giấy phủ → xuất hiện cạnh biển khu đích | | |
| 4 | Xe GD110 | E lên xe; W/S/A/D lái trong hành lang đường; C bật Auto Cruise. Esc/C/mở menu/mất focus thì hủy cruise. E xuống xe chỉ ở chỗ an toàn | | |
| 5 | 4 mốc bí mật | Không bảng, không phát sáng, phải tự tìm. Câu phản hồi ẩn dụ (**TBD: Duy duyệt câu chữ**) | | |
| 6 | Ending 36 s | Đủ 3 secret rồi ngồi ghế gỗ: ghế → bờ biển hoàng hôn → dừng ở Last Postcard; có Skip | | |
| 7 | Mascot | Bay theo, gợi ý 1 lần mỗi khu, có thể tắt trong menu | | |
| 8 | Âm thanh | Nút Sound bật âm rừng, suối, gió, sóng tổng hợp bằng trình duyệt (0 byte tải, không cần giấy phép). Chưa có nhạc | | |
| 9 | Cỏ và đá | Cụm cỏ ven suối, đường đi; đá thưa | | |

## Câu chữ secrets cần Duy duyệt (D-24 đề xuất)

| Secret | EN | VI |
|---|---|---|
| Reflection | The water holds a little light. | Mặt nước giữ lại một chút sáng. |
| Forgotten Sound | A quiet note drifts through the leaves. | Một nốt trầm trôi qua kẽ lá. |
| Unmarked Road | A faint path opens between the shadows. | Lối mờ hé mở giữa những bóng cây. |
| Unwritten Page | The page turns softly toward the sea. | Trang giấy khẽ nghiêng về phía biển. |
| Chưa đủ 3 secret | The page rests, waiting for a gentler breeze. | Trang giấy nghỉ yên, chờ một làn gió nhẹ. |

## Đã biết, chưa làm

- **Ending chưa được xem bằng mắt trong world thật.** Muốn kích hoạt phải đi tìm đủ 3 secret. Unit test đã phủ chuỗi trạng thái và đường camera (không chui dưới đất hay nước, có Skip); đợt sau tôi quay video ending bằng một hook test.
- Forgotten Sound hiện chỉ có văn bản; âm thanh riêng cho secret này làm sau.
- Chưa có nhạc. Q-26: chỉ dùng nhạc có giấy phép rõ ràng, sẽ đề xuất danh sách sau.
- T08/T09 (FPS trên Iris Xe) chưa đo. Đợt này có thêm cỏ, đá, nhân vật có skin, xe và mascot, nên đo FPS là việc quan trọng tiếp theo.
