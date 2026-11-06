## TICKET B2-220: First Light và Roots làm kỹ vòng 6 (điểm nhìn đầu tiên của người chơi)

- Đọc `_finish-common.md`, `_zone-r4-common.md`. File: `src/features/world/zones/first-light.ts`, `src/features/world/zones/roots.ts` + test. Không sửa kit.

### Vấn đề (ảnh `docs/showcase/27-hoan-thien-1/05-first-light.webp`, `docs/showcase/26-asset-ky/06-roots.webp`)

- First Light là khung hình đầu tiên người chơi thấy nhưng **khu gần như trống**: một cọc nhỏ và khúc gỗ tối, nhìn không ra chủ đề "lời chào đầu".
- Roots: gốc cổ thụ là trụ xám trơn, rễ khó thấy.

### Việc

1. First Light: tạo **một bố cục điểm nhấn** đọc được từ vị trí spawn (cách 6–12 m): khúc gỗ ghế có sổ tay mở (giấy `paper` + vài nét `ink`, không chữ), cốc nhỏ, cụm dương xỉ + hoa trắng, cột gỗ hộp thư; tất cả bám đất, có rêu chân. Ánh sáng: một vệt nắng (đã có shaft) rơi đúng lên chỗ ngồi.
2. Roots: gốc cổ thụ có vỏ nứt (sọc vertex color), loe gốc rõ, 6–9 rễ nổi to (bán kính gốc ≥ 0,25 m) bò ra và chìm vào đất, rêu xanh ở mặt trên rễ.
3. Ngân sách khu theo `_zone-r4-common.md`; dựng ≤ 200 ms trên Node mỗi khu.

### Test

- First Light: các phần trên đều có trong batch (tên phần), nằm trong 6–12 m trước spawn theo hướng camera mở đầu; không vật nào trong 3 m quanh spawn.
- Roots: rễ có bán kính gốc ≥ 0,25 m, mỗi rễ có ≥ 2 điểm chìm dưới terrain.
- Test khu cũ pass (fingerprint đổi thì ghi lý do).
