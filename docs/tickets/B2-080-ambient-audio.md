## TICKET B2-080: Âm thanh môi trường tổng hợp bằng WebAudio (không dùng file, không vướng giấy phép)

- Trạng thái: Assigned → Codex, đợt 19, nhánh `lane/B2-080`
- Đọc trước:
  - `_common-b2.md`
  - Spec §2: "Âm thanh: indie mộc kết hợp môi trường rừng/suối/biển, chuyển mềm theo vùng; chỉ dùng nguồn được phép"; "âm thanh chỉ phát sau thao tác bật của người xem".
  - Spec §9: "Thông tin truyền bằng audio có văn bản tương đương; secret âm thanh dùng được khi mute".
  - D-19 / Q-26: không có bản thu của Duy. Nhạc có giấy phép sẽ tính sau. Ticket này **chỉ làm âm môi trường tổng hợp**.
  - `src/features/world/layout/` (`ZONES`, biome, `timeOfDayAt`).
- Lý do chọn tổng hợp: tạo âm bằng WebAudio ngay trong trình duyệt nên **không có file âm thanh** (0 byte tải, không cần giấy phép).

### Việc

Tạo thư mục mới `src/features/audio/`:

1. **`ambience.ts`**: `createAmbience(context: AudioContext)`. Các lớp:

   | Lớp | Cách tạo |
   |---|---|
   | Suối | noise lọc bandpass, có điều biến chậm |
   | Gió rừng | noise lowpass, phồng xẹp chậm |
   | Chim | chirp sine, ngẫu nhiên có seed, thưa, chỉ ở biome rừng |
   | Sóng biển | noise lowpass + envelope chu kỳ 6–9 s |

   - `setMix({ stream, wind, birds, sea })` trong [0,1], chuyển mượt (`linearRampToValueAtTime`, ≥ 1,5 s).
   - `setMasterVolume(v)`, `mute()`, `dispose()`.
   - Không `setInterval` dày: lập lịch chim bằng thời gian của AudioContext.
2. **`mix.ts`**: hàm thuần `ambienceMixAt({ distanceToRiver, zoneBiome, timeOfDay, distanceToSea })` trả về mix.
   - Rừng bình minh: chim + suối.
   - Đồi: gió.
   - Bờ biển: sóng mạnh, chim ít.
3. **`controller.ts`**: `createAudioController()`.
   - **Chỉ tạo AudioContext sau thao tác người dùng** (hàm `enable()` được gọi từ handler click/phím).
   - Có `disable()`.
   - `update(position-derived inputs)` giới hạn 4 Hz.
   - Tôn trọng `prefers-reduced-motion`? Không cần (âm thanh không phải chuyển động). Nhưng âm lượng mặc định thấp: 0,35.
4. **Không nối vào world/shell.** Lead nối. Bàn giao đoạn mã nối.

### Được sửa

- `src/features/audio/**`
- `tests/unit/audio/*.test.ts`

### Test

Dùng AudioContext giả (mock node graph):

- Không tạo context trước `enable()`.
- `mix` đúng xu hướng ở rừng, đồi, biển.
- Ramp thời gian ≥ 1,5 s.
- `mute` và `dispose` ngắt mọi node.
- Chim chỉ ở biome rừng.
- Lập lịch có seed nên tất định.
- Bundle: module không bị import từ `src/app`. Kiểm bằng grep trong test.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
