## TICKET B2-177: chuyển màu 4 khu ngoài trời (đồi, biển) sang hướng A

- Được sửa:
  - `src/features/world/zones/milestones.ts`
  - `src/features/world/zones/horizon.ts`
  - `src/features/world/zones/quiet-shore.ts`
  - `src/features/world/zones/last-postcard.ts`
  - test tương ứng trong `tests/unit/world/zones/`
- Đọc `_dirA-common.md` và `_zone-common.md`.

### Lead thấy trên ảnh

- **Horizon:** dưới tuabin, ống nhòm và ghế có các **đĩa nền màu xanh đậm** nhìn như vết sơn.
- Hiên Quiet Shore và bưu cục Last Postcard còn tông giấy/mực cũ.

### Việc

1. **Bỏ các đĩa nền màu đặc** dưới vật. Vật đứng trực tiếp trên cỏ, có thể thêm vài bụi cỏ/đá nhỏ quanh chân.
2. **Màu tự nhiên:**
   - tuabin trắng `laneWhite`;
   - gỗ hiên, hàng rào: `dusk` pha `rockDark`;
   - sơn trắng cũ: `cloud` pha `rock`;
   - hộp thư: kem `cloud` + viền `rockDark`;
   - đá Milestones: `rock`/`rockDark` có đốm rêu `grass`;
   - đàn piano: `rockDark` pha `ink`, phím `cloud`/`ink`;
   - chó: `dusk` pha `sand`.
3. **Hình khối, vị trí, interactable, collider giữ nguyên.** Piano, chó, xe của B2-156 giữ.

### Test

- Không còn mesh đĩa nền (tên hoặc hình dạng đĩa mỏng bán kính > 1 m).
- Mọi màu thuộc PALETTE, không gần `paper` (trừ giấy).
- Ngân sách khu.
- Test cũ pass.
