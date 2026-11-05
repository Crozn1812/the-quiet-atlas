## TICKET B2-176: chuyển màu 4 khu trong rừng sang hướng A

- Được sửa:
  - `src/features/world/zones/first-light.ts`
  - `src/features/world/zones/roots.ts`
  - `src/features/world/zones/workshop.ts`
  - `src/features/world/zones/old-trail.ts`
  - test tương ứng trong `tests/unit/world/zones/`
- Đọc `_dirA-common.md`, `_forest-common.md` và `_zone-common.md` (hợp đồng khu, ngân sách).

### Việc

1. **Bỏ mọi tông giấy kem/mực của hướng C.** Màu vật liệu tự nhiên:
   - gỗ mới: `dusk` pha `rockDark`;
   - gỗ cũ phủ rêu: `rockDark` pha `forestDeep` + đốm `grass`;
   - đá: `rock` / `rockDark`;
   - kim loại cũ: `rockDark` pha `indigo`;
   - giấy / bản đồ: `cloud`;
   - mái: `rockDark` phủ rêu `forestDeep`.
2. **Bỏ mọi "đĩa nền" màu đặc dưới khu** (nếu có), để khu nằm trên nền rừng tự nhiên.
3. **Thêm chi tiết nhỏ hợp rừng ẩm:** rêu ở chân vật, vài dương xỉ sát vật (≤ 300 tam giác mỗi khu). Phải giữ đủ ngân sách khu.
4. **Hình khối, vị trí, interactable, collider giữ nguyên.**

### Test

- Mọi màu thuộc PALETTE (dùng hàm kiểm có sẵn).
- Không còn màu nào gần `paper` (khoảng cách màu > 0,08), trừ đồ giấy.
- Ngân sách khu.
- Test cũ pass.
