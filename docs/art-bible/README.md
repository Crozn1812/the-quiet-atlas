# Art bible — The Quiet Atlas

**Khóa 2026-11-06 — hướng A** (`docs/tickets/B2-184-art-bible-lock.md`).

- Hướng A = **Tranh chân thật**, preset runtime **R**; không nhầm với preset A màu nước lịch sử. Nguồn: `docs/adr/0013-art-direction-painted-world-film-memories.md`, mục đổi sang Tranh chân thật; `src/features/world/art/direction.ts`, `WORLD_DIRECTION`.
- Thế giới rõ, tự nhiên, nắng trong, shading vẽ tay mềm; ký ức vẫn là ảnh film. Mục ADR đổi hướng thay quyết định C sơ khởi; vòng chọn hướng đã chốt, không còn trạng thái chờ chọn style frame.

| File | Nội dung | Trạng thái |
|---|---|---|
| [taste.md](taste.md) | Lời Duy nguyên văn, nguồn gốc gu | Không sửa |
| [palette.md](palette.md) | Màu PALETTE, vai trò, diện tích tương đối | Khóa |
| [lighting.md](lighting.md) | Bình minh → đồi → hoàng hôn, fog/luma, nước | Khóa; ghi rõ phần nước chưa nối đủ |
| [shading.md](shading.md) | Ramp, bóng lạnh, hậu kỳ R, phạm vi sương | Khóa; nêu ngoại lệ sương sớm |
| [asset-budgets.md](asset-budgets.md) | Trần asset/world, instancing, biến thể, máy đo | Khóa ngân sách; không xác nhận benchmark |
| [materials.md](materials.md) | Chỉ dẫn từng chất liệu và code đối chiếu | Khóa |
| [character.md](character.md) | Nhân vật: taste và số liệu script | Khóa mô tả; tổng tam giác chưa đo |
| [gd110.md](gd110.md) | Xe: scrambler, phụ kiện, tỷ lệ và test runtime | Khóa mô tả; tổng tam giác chính xác chưa đo |
| `refs/` | Ảnh cá nhân và tham chiếu nội bộ | gitignore; chỉ lấy cảm hứng, không lấy pixel/bố cục/logo |

- **Quy trình đổi:** đề xuất → ghi ADR giải thích thay đổi và nguồn/số đo → duyệt quyết định → cập nhật art bible cùng code/test liên quan trong ticket được phép → Lead đối chiếu cảnh chuẩn và gate. Đổi phải có ADR; không sửa lời Duy trong `taste.md` để hợp thức hóa khác biệt.
- Mỗi số kỹ thuật phải kèm nguồn; phân biệt trần, mục tiêu, giá trị code và phép đo thực tế. Chưa có phép đo thì ghi **chưa đo**. Không tự đặt phần trăm màu hay nhận unit test là bằng chứng GPU.
- Điểm còn mở được ghi tại file tương ứng: B2-181 chưa truyền đủ ánh sáng vào nước; sương sớm B2-180 cần thống nhất với phạm vi ADR; biến thể ground chưa đồng đều; màu ngoại lệ sẵn có của nhân vật/kim loại xe. Khóa chỉ dẫn không có nghĩa mọi asset đã đạt nghiệm thu.
- Phạm vi B2-184 chỉ là tài liệu: không thay code, dependency hay lưu trạng thái. **Lead không cần nối gì vào `src/features/world/index.ts`**; preset R đã được chọn trong `art/direction.ts`. Mẫu ghi nhận bàn giao, không cần áp dụng:

```ts
// B2-184 chỉ khóa docs/art-bible/.
// Không có module mới để import hoặc khởi tạo trong index.ts.
```
