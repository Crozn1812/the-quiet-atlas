## TICKET B2-156: Quiet Shore kể đúng sở thích của Duy

- Được sửa: `src/features/world/zones/quiet-shore.ts`, `tests/unit/world/zones/quiet-shore.test.ts`.
- Đọc kèm `_zone-common.md` (hợp đồng khu, ngân sách) và `_coast-common.md`.

### Sở thích Duy đã kể (Q-37)

- Thích piano hơn guitar, nhưng tò mò mọi loại nhạc cụ.
- Nghe nhạc indie (máy hát giữ nguyên).
- Thích xe máy dáng classic (xe kem đã có, giữ nguyên, không logo, không chữ).
- Thích chó vì chó trung thành.
- Thích biển.

### Việc

1. **Đàn piano đứng nhỏ** trên hiên, nắp mở, phím là dải sáng/tối đơn giản (không chữ). Đây là nhạc cụ chính.
   - Guitar giữ lại nhưng nhỏ hơn hoặc dựng cạnh piano.
2. **Một chú chó nằm ngủ** trên thềm hiên, low-poly ≤ 400 tam giác, dáng đơn giản, màu từ PALETTE. Không phải giống chó/nhân vật của thương hiệu nào.
3. Có thể thêm **1 nhạc cụ nhỏ khác** (ví dụ harmonica hoặc trống tay) trên bàn, gợi ý "tò mò mọi nhạc cụ". Không bắt buộc.
4. Hiên vẫn hướng ra biển (B2-141); ghế secret gần đó giữ nguyên.

### Ngân sách và test

- `ZONE_BUDGET`: ≤ 6 000 tam giác, ≤ 8 draw call.
- Có node tên `piano` và `dog`.
- Mọi test hiện có của khu và test đặt trên địa hình thật pass.
