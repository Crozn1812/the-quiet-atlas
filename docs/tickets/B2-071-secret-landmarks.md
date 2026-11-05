## TICKET B2-071 — Mốc cảnh cho 4 secret (procedural, chưa nối)

- Trạng thái: Assigned → Codex, đợt 20, nhánh `lane/B2-071`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/story/secrets.ts` (B2-070): các `landmark` là `vine-arch-mirror`, `wind-chime`, `faint-trail`, `bench`.
  - `src/features/world/props/` (B2-046): phong cách dựng, `createPropMaterial`, vertex color.
  - `docs/art-bible/taste.md`: dòng Reflection ("gương tròn giữa vòm dây leo có hoa cam") và Quiet Shore ("ghế gỗ, hàng rào gỗ có hoa leo").
- Ràng buộc:
  - Màu chỉ lấy từ PALETTE. Hoa cam/đỏ son là điểm nhấn **nhỏ** (taste §5.3).
  - Không chữ, không logo.
  - Mốc tinh tế: **không phát sáng nổi bật, không icon**, phải tự tìm (spec §7.2).

### Việc

Tạo file mới `src/features/world/props/secrets.ts` với hàm `createSecretLandmark(landmark)`.

| Landmark | Hình | Ngân sách tam giác |
|---|---|---|
| `vine-arch-mirror` | Vòm gỗ thấp phủ dây leo (các cụm lá nhỏ), vài bông `flower` cam. Ở giữa là gương tròn: đĩa màu `mist` pha `paper`, viền gỗ mảnh. | ≤ 700 |
| `wind-chime` | Cành cây khô treo 5 ống mảnh màu `dusk` mờ, dây mảnh. Có node con `chimes` để world lắc nhẹ. | ≤ 300 |
| `faint-trail` | Dải đá lát thưa, 10–14 viên phẳng, chạy 8–10 m, cuối là một cột đá nhỏ không chữ. | ≤ 500 |
| `bench` | Ghế gỗ dài hướng ra biển, cạnh một đoạn hàng rào gỗ thấp có hoa leo. | ≤ 600 |

- Mỗi hàm trả về `Group`. Gốc tại mặt đất (y = 0 là chân đứng).
- Đặt `userData.landmark`.
- Có `dispose()` (qua `userData.dispose`, hoặc hàm `disposeLandmark(group)`).

**Không nối world.** Lead nối. Bàn giao đoạn mã nối.

### Được sửa

- `src/features/world/props/secrets.ts`
- `tests/unit/world/secret-landmarks.test.ts`

### Test

- Đúng ngân sách tam giác từng mốc.
- Màu khớp PALETTE.
- Tỷ lệ hoa cam: tổng diện tích bề mặt có màu `flower`/`vermilion` ≤ 8 % của mốc.
- Tất định.
- Bounding box hợp lý:
  - ghế dài 1,6–2,2 m;
  - vòm cao 2–2,8 m.
- Có node `chimes`.
- `dispose` hoạt động.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`. Không commit.
