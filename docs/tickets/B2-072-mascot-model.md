## TICKET B2-072: Mascot, hình dạng và hành vi bay theo (logic + mesh, chưa nối)

- Trạng thái: Assigned → Codex, đợt 19, nhánh `lane/B2-072`
- Đọc trước:
  - `_common-b2.md`
  - Spec §2: "Mascot là phân thân cảm xúc (rừng + nước + công nghệ), bay theo nhân vật, … gợi ý theo khu vực, có thể tắt".
  - Spec §9 / dòng 379: "Mascot chỉ gợi ý khi phù hợp, không lặp dồn dập, không cướp focus".
  - Spec dòng 643: gợi ý đọc dự án hoặc cách điều khiển; không tự mở chatbot, không suy đoán cảm xúc người xem.
  - Taste §5.2–5.4.
  - `src/features/world/foliage/shapes.ts` (phong cách dựng procedural).
  - `src/features/world/art/palette.ts`.

### Việc

Tạo thư mục mới `src/features/mascot/`:

1. **`shape.ts`**: `createMascotMesh()`, một tinh linh nhỏ cao khoảng 0,35 m, ≤ 300 tam giác.
   - Thân là một giọt nước màu `mist` pha `water`.
   - Hai lá non nhỏ trên đầu, màu `forestLight`.
   - Một vòng sáng mảnh màu `dusk`, gợi chất công nghệ.
   - Vật liệu ramp toon, chỉ dùng màu PALETTE. Không mặt người, không chữ.
2. **`follow.ts`**: logic thuần.
   - Bay sau vai phải nhân vật, cách 1,2 m, cao 1,6 m.
   - Lơ lửng lên xuống ±0,08 m, chu kỳ 3 s. Reduced motion: đứng yên tương đối, không lắc.
   - Đuổi theo mượt (critically damped), không xuyên terrain.
   - Khi nhân vật teleport: snap.
3. **`hints.ts`**: chọn gợi ý theo khu.
   - Vào zone lần đầu trong phiên → 1 gợi ý ngắn.
   - Cooldown ≥ 45 s. Không lặp gợi ý đã nói trong phiên.
   - Tắt mascot thì không gợi ý.
   - Văn bản EN/VI ≤ 14 từ: cách điều khiển, hoặc mời đọc nội dung khu (E). Không suy đoán cảm xúc.
4. **Không nối world/shell.** Lead nối. Bàn giao đoạn mã nối.

### Được sửa

- `src/features/mascot/**`
- `tests/unit/mascot/*.test.ts`

### Test

- Ngân sách tam giác; màu chỉ từ palette.
- Follow hội tụ, không overshoot quá 0,1 m, không xuống dưới terrain + 0,3 m.
- Reduced motion không lơ lửng.
- Snap khi teleport.
- Hints: cooldown, không lặp, tắt thì im, đúng locale.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
