# Bàn giao Ticket B2-091 — Tiếng chuông gió ở bí mật Forgotten Sound (cổng 4521)

- **Lane / Milestone:** L3 audio / B2
- **Thợ thi công:** AG-B2-091

---

## 1. File đã sửa

Đúng danh mục **Được sửa** theo ticket `docs/tickets/B2-091.md`:

1. `src/features/audio/mix.ts`:
   - Thêm `chime?: number` vào interface `AmbienceMix`.
   - Thêm `distanceToChime?: number` vào interface `AmbienceInputs`.
   - Bổ sung hàm thuần `chimeProximity(distance: number | undefined): number`:
     - Trả về `0` khi `distance >= 18` m, `undefined`, hoặc `NaN`.
     - Trả về `1` khi `distance <= 4` m.
     - Nội suy mượt theo hàm Hermite/smoothstep $t^2(3 - 2t)$ trong dải $4 < d < 18$ m (đơn điệu tăng khi lại gần, giảm dần khi đi xa).
   - Đưa `chime` vào kết quả trả về của `ambienceMixAt(inputs)`. Hàm vẫn là hàm thuần, chỉ phụ thuộc khoảng cách/vị trí, không phụ thuộc vào trạng thái bí mật đã khám phá hay chưa (không lộ tiến trình).

2. `src/features/audio/ambience.ts`:
   - Định nghĩa thang ngũ cung thanh mảnh `CHIME_SCALE = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0]` (C6, D6, E6, G6, A6, C7).
   - Thêm kênh gain `chime` vào `channels` (nối qua fader vào `master`).
   - Tổng hợp chuông gió 100% WebAudio bằng FM synthesis (Frequency Modulation) + envelope:
     - Carrier oscillator: sine wave tại nốt ngũ cung ngẫu nhiên từ seed.
     - Modulator oscillator: sine wave tại tỷ lệ inharmonic $f_m = f_0 \times 2.76$, điều chế qua modGain để tạo tiếng "keng" kim loại đanh mảnh lúc gõ (decay trong 0.1 s).
     - Envelope gain: attack ramp 35 ms ($\ge 30$ ms để chống pop/click), decay mượt về 0 trong 1.2–2.2 s. Peak volume ở mức 0.24 ($\le 0.5$ so với master).
     - Khoảng nghỉ giữa các lần gõ: ngẫu nhiên từ seed trong khoảng 0.8–4.0 s (`0.8 + chimeRandom() * 3.2`), không theo bất kỳ giai điệu nào.
     - Lên lịch theo chuỗi `carrier.onended` trên audio clock, tự hủy node khi phát xong và lên lịch nốt tiếp theo khi `chimeEnabled` còn bật.
   - Khi `mix.chime === 0`, khi tắt Sound, hoặc khi `dispose()` / `mute()`: gọi `releaseChime(true)` giải phóng toàn bộ nodes/sources ngay lập tức và không lên lịch nốt mới.

3. `src/features/world/index.ts`:
   - Sửa **đúng một chỗ** tại hàm `publishAmbience(now: number)` (dòng gọi `ambienceMixAt`):
     - Lấy toạ độ của mốc `forgotten-sound` từ mảng `SECRETS` (đã import ở đầu file).
     - Truyền `distanceToChime` vào input của `ambienceMixAt` theo khoảng cách 3D Euclidean Euclidean từ `physics.position` tới cột mốc chuông gió.
     - Không sửa bất kỳ dòng nào khác trong `index.ts`.

4. `tests/unit/audio/audio.test.ts`:
   - Bổ sung helper `chimes()` và `finishChime()` cho `FakeContext` để tách biệt bird oscillators và chime oscillators.
   - Thêm test mix chuông theo khoảng cách: 0 ở $\ge 18$ m, bằng 1 ở $\le 4$ m, đơn điệu tăng khi lại gần, `NaN` và `undefined` trả về 0.
   - Thêm test không lên lịch khi mix = 0, và huỷ nốt đã lên lịch khi chuyển mix về 0.
   - Thêm test lịch nốt tất định theo seed (cùng seed cho kết quả giống hệt, khác seed cho kết quả khác) và chọn đúng các nốt từ `CHIME_SCALE`.
   - Thêm test dispose / mute giải phóng toàn bộ nodes của chime.
   - Thêm test kiểm tra attack ramp $\ge 30$ ms và peak volume $\le 0.5$.

*(Không sửa `package.json`, không sửa lockfile, không tải bất kỳ file ngoài nào).*

---

## 2. Kết quả lệnh kiểm tra

Tất cả các lệnh kiểm tra đều thực thi thành công với exit code 0:

- **`pnpm lint`**:
  ```text
  $ eslint .
  Exit code: 0 (0 error, 0 warning)
  ```
- **`pnpm typecheck`**:
  ```text
  $ tsc --noEmit
  Exit code: 0
  ```
- **`pnpm exec vitest run tests/unit/audio`**:
  ```text
   RUN  v5.1.0 D:/tqa-worktrees/AG-B2-091

   ✓ tests/unit/audio/audio.test.ts (24 tests) 45ms

   Test Files  1 passed (1)
        Tests  24 passed (24)
     Duration  209ms
  Exit code: 0
  ```
- **Kiểm tra hồi quy toàn bộ test suite (`pnpm test`)**:
  ```text
   Test Files  150 passed (150)
        Tests  1742 passed (1742)
     Duration  57.56s
  Exit code: 0
  ```

---

## 3. Cách nghe thử

1. **Khởi động ứng dụng**:
   - Chạy môi trường kiểm tra (Lead chạy build hoặc dev server: cổng 4521).
   - Truy cập trang web và bấm nút bật **Sound** (hoặc phím tắt bật âm thanh) để kích hoạt `AudioContext`.
2. **Di chuyển đến bí mật Forgotten Sound**:
   - Vị trí bí mật `forgotten-sound` nằm ở lùm rừng giữa xưởng chế tác (Workshop, $t \approx 0.15$) và cột mốc (Milestones), lệch sang phía bên phải tuyến đường chính ($t = 0.165$, offset lateral $+28$ m).
3. **Hiện tượng âm thanh**:
   - Khi đứng xa hơn 18 m: không nghe tiếng chuông gió (`mix.chime = 0`).
   - Khi tiến lại gần trong khoảng 18 m $\to$ 4 m: bắt đầu nghe thấy tiếng chuông kim loại mảnh ("keng/ting" nhẹ và ngân), thưa thớt, âm lượng tăng dần khi tiến lại gần.
   - Trong cự ly $\le 4$ m: âm chuông gió rõ nhất.
   - Tần số các nốt thuộc thang ngũ cung thanh nhẹ (C6 $\to$ C7), khoảng nghỉ không đều từ 0.8 đến 4.0 giây, không tạo thành giai điệu lặp lại.
   - Khi đi ra xa khỏi cột mốc: âm lượng chuông mờ dần và tắt hẳn khi vượt qua 18 m.
   - Khi tắt Sound hoặc tạm dừng thế giới (world pause): không có thêm nốt mới nào được phát, node âm thanh được dọn dẹp, không phát ra tiếng click/pop.

---

## 4. Việc chưa làm / Cần Lead

- **Chưa chạy build tĩnh & chưa mở trình duyệt live**: Theo đúng luật ticket ("Không cần build hay mở trình duyệt (Lead chạy)"), phần kiểm tra trực tiếp trên trình duyệt sẽ do Lead tiến hành khi tích hợp.
- **Không push / không commit**: Giữ nguyên worktree sạch sẽ, sẵn sàng để Lead review diff và commit.
