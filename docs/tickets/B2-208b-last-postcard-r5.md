## TICKET B2-208b: Last Postcard vòng 5

- Đọc `_zone-r4-common.md`. File: `src/features/world/zones/last-postcard.ts` + test. Ảnh: `docs/showcase/26-asset-ky/lead-review/zones-r4-sheet.webp` (ô cuối bên phải).

### Lead thấy

1. Hai tảng đá cạnh hộp thư trông như **lốp xe** (trụ dẹt tròn đen). Dùng `createRockGeometry("boulder"|"stone")` có mặt vỡ, màu `rock`/`rockDark` có cỏ khô quanh chân; không trụ tròn.
2. Hộp thư và giá bưu thiếp đọc được, giữ.
3. Bệ đá xếp: thấy rõ các viên đá riêng, không một tấm phẳng.

### Test

- Không geometry nào trong khu là trụ tròn đều (kiểm: mọi mesh đá có ≥ 30 % mặt phẳng lớn như test kit đá).
- Test cũ pass.
