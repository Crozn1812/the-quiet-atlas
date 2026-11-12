# Góp ý playtest vòng 2 của Duy (2026-11-12)

Bản thử: RC-01 + phần Codex sửa dở theo góp ý vòng 1 (`rc-02-base` = `f0175ba`). Ảnh Duy chụp: lưu trong phiên Claude, mô tả lại bên dưới theo đúng thứ tự Duy đánh số.

## Danh sách góp ý → ticket

| # | Góp ý (tóm tắt) | Ticket |
|---|---|---|
| 1 | First Light: tảng đá nguồn suối vô duyên → muốn **sườn núi** che kín phía sau. Tia nắng **lấp lánh lọt qua tán lá từ trái sang phải**. Cây **rậm hơn**, cành sum suê, tán dày **che kín bầu trời** | FL-03 |
| 2 | Góc nhìn ở First Light vẫn thấy trời qua tán thưa → chưa ra bình minh, chưa có ánh sáng lấp ló | FL-03 |
| 3 | Đi xe: bấm D thì xe sang trái, A sang phải (ngược). Khi cua, ghi-đông và tay nhân vật không xoay theo hướng chạy | VH-02 |
| 4 | **Bỏ hẳn mascot** (giọt nước lơ lửng cạnh nhân vật) | MS-01 |
| 5 | Overlay dự án: sơ đồ kiến trúc quá nhỏ; không biết bấm vào tên dự án để mở nội dung đầy đủ | UI-05 |
| 6 | Bí mật (ví dụ chuông gió): chi tiết quá nhỏ → **to hơn**, mang vẻ **mơ hồ, bí ẩn**, nhưng phải nhìn thấy được | SC-01 |
| 7 | Khu Kỹ năng (Roots): muốn một **cây cổ thụ khổng lồ nhiều tán, cành ngoằn ngoèo chằng chịt, như cây trong truyền thuyết elf** (cây phóng to hiện tại không đạt) | RT-02 |
| 8 | Mục Skill trong overlay: **mỗi skill một dòng**, không viết nối thành câu | UI-05 |
| 9 | Chứng chỉ: thêm **CCNA (nhận T3/2026)**. Các cục đá chứng chỉ trông như lốp xe → đổi thành **tượng đá điêu khắc chính Duy, chưa thành hình**: các mảnh đá vỡ đang ghép lại; mỗi chứng chỉ là một mảnh, đủ chứng chỉ thì tượng hoàn thiện | UI-05 (CCNA) + MS-02 |
| 10 | Vẫn trong vùng rừng (Milestones…) mà còn sơ sài, quá sáng | FL-03 (áp cho cả biome rừng) |
| 11 | Workshop trông như cửa chuồng heo → làm **to như cổng đình làng**, có **chi tiết đang cháy** (đuốc/lửa) thể hiện sức trẻ đang từng bước hoàn thiện bản thân | WS-02 |
| 12 | Horizon: theo chốt thiết kế, **E vào ghế để ngồi ngắm cảnh**, hiện chưa làm được | HZ-02 |
| 13 | Đầu đường nhựa có **chóp nhọn** → chuyển từ đường đất sang đường nhựa tự nhiên | RD-02 |
| 14 | Cuối đường: chân nhân vật **lọt xuống mặt đường** | RD-02 |
| 15 | Cuối đường: chưa có chỗ bấm E để tựa hai tay lên lan can ngắm mặt trời (RD-01 đã có, bản dở làm mất) | RD-02 |
| — | Map quá dài và rộng khi đi bộ → **thu ngắn** cho dễ tiếp cận | MAP-01 (làm riêng, sau vòng này) |
| — | Đồ họa còn kém, muốn hướng **AAA** → Lead đề xuất các MCP đồ họa để Duy chọn | Lead |
| — | Gắn tên miền + AWS để test không cần PC | Lead viết hướng dẫn; **Duy tự chạy** (luật: AI không chạm cloud/credential) |

**Việc còn sót từ vòng 1**, gộp vào ticket tương ứng:
- suối: nhân vật **đi xuống được**, **có cá** → FL-03 (đoạn suối First Light) hoặc ticket nước riêng sau MAP-01;
- nhóm kỹ năng **Tools** (Postman…) → UI-05;
- render lại file PDF CV theo nội dung mới → UI-05;
- bảng sơ đồ tư duy kỹ năng: Duy nói "khu tiếp theo", tức khu **Roots** (sau First Light) → RT-02 chuyển bảng sang Roots, cạnh cây cổ thụ.

## Thứ tự

1. **S-00** (một mình): làm xanh `rc-02-base`. 32 unit test đang FAIL vì hình học suối, đường, lan can, dressing đã đổi. Sửa đúng gốc, cập nhật test có chủ đích. Rebase lên main `eb80eb6`.
2. Sau khi S-00 merge, chạy **song song** (vùng file riêng):
   - FL-03, VH-02, MS-01, UI-05, SC-01, RT-02, MS-02, WS-02, HZ-02, RD-02;
   - chỗ nối trong `index.ts` giữ ngắn để merge ít xung đột.
3. **MAP-01** làm một mình sau cùng, vì nó dời vị trí mọi khu.

Mọi ticket áp `_common-b2.md`, `_review-common.md`, `_graphics-common.md`. Codex tự build, tự chụp ảnh **High** những chỗ mình sửa và đủ 8 khu, rồi dán đường dẫn ảnh. Lead duyệt bằng ảnh trước khi merge.
