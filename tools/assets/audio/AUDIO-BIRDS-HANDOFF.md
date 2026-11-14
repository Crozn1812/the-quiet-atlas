# AUDIO-BIRDS

18 clip CC0 từ 5 bản thu có sẵn, mono 48 kHz, OGG Opus VBR 56 kbps; tổng 278.232 byte. Fade in 30 ms, fade out 40 ms; high-pass theo loài, giảm nhiễu nhẹ, loudnorm hai lượt ở -25 LUFS. Loudness đo lại sau encode: -25,11 đến -24,92 LUFS; true peak cao nhất -9,08 dBTP.

## File bàn giao

- `public/audio/birds/*.ogg`: 4 may áo, 5 sẻ, 3 chích chòe, 3 bulbul, 3 hải âu (bảng bên dưới).
- `assets/LICENSES.csv`: thêm đúng 18 dòng CC0-1.0, tác giả và trang Commons từ SOURCES.md cho từng file.
- `tools/assets/audio/birds-cut.mjs`: toàn bộ khoảng cắt, filter, ffmpeg hai lượt, encode, inventory và preview; chạy lại bằng `node tools/assets/audio/birds-cut.mjs`. Không tải mạng hoặc ghi vào audio-src. Chạy lại không tạo dòng license trùng.
- `src/features/audio/birds.ts`: voice ghi âm + fallback tổng hợp, bank decode theo loài và hủy request.
- `src/features/audio/mix.ts`: chuyển biome thành `birdHabitat` cùng listener hiện có.
- `src/features/audio/ambience.ts`: **file sát bên ngoài danh sách cụ thể của ticket**, cần thay scheduler chim cũ bằng `createBirdVoice` và gọi dispose; các lớp nước/gió/chime giữ nguyên. Áp dụng ngoại lệ 1–2 file sát bên theo quy tắc chung.
- `tests/unit/audio/bird-recordings.test.ts`: deferred loading, thực sự thay fallback, HRTF, pitch, bốn loài rừng, hải âu theo biome, khoảng nghỉ chiều, lỗi HTTP/mạng/decode, partial failure, callback đến muộn, dispose và inventory/Opus mono.
- `tests/unit/audio/audio.test.ts`: cho phép fetch riêng ở birds.ts; vẫn cấm timer/storage và runtime import world.
- `tools/assets/audio/birds-browser-check.mjs`: kiểm tra bản export trên Edge thật (SwiftShader), online/offline, request boundary, decode Opus, HRTF, mute và callback cũ.
- `test-results/audio-birds/`: preview 30 s, clips.json/clips.md, ffmpeg-commands.json, log gate, browser-check.json và ảnh Edge. Thư mục evidence bị gitignore; Lead cần giữ/copy riêng khi bàn giao.

## Hành vi

Không request khi import, dựng controller, Sound ở Welcome, hoặc mix chim im lặng. Bank chỉ tải khi graph opt-in đang chạy và có chim nghe được sau Enter World. Giữ nguyên contract Sound và cầu nối `tqa:ambience`.

Rừng chọn ngẫu nhiên may áo/sẻ/chích chòe/bulbul, biển chỉ hải âu. Clip ngẫu nhiên, playbackRate 0,97–1,03. Khoảng nghỉ 4–9 s buổi sáng, 16–36 s ở evening=1, tính từ cuối câu trước. Vị trí chim/cây đi qua PannerNode HRTF; attenuation khoảng cách dùng birdLevel hiện có. Chỉ một câu được xếp lịch. Không timer, storage hoặc trạng thái URL.

Xếp fallback ngay để mạng không chặn phát âm; clip decode kịp sẽ thay fallback trước giờ phát với cùng thời điểm. Decode đến khi câu đã bắt đầu thì đợi câu sau. Lỗi HTTP/mạng/codec giữ tổng hợp. Một clip hỏng không bỏ các clip tốt cùng loài. Request lỗi được nhớ trong phiên, tránh retry liên tục; bật Sound lại tạo bank mới. Mute/dispose abort request, giải phóng buffers/nodes và chặn callback cũ.

## Giới hạn đã biết

- Bản chích chòe chỉ dài 1,366961 s. Ba file là **các trim chồng lấn của cùng một câu**, không phải ba câu độc lập. Không lặp hoặc kéo dài giả bản thu. Cần nguồn dài hơn từ Lead nếu bắt buộc ba câu khác nhau.
- Bulbul được cung cấp là **Light-vented bulbul / Pycnonotus sinensis**; không gắn nhãn thành một loài chào mào khác.
- Đã chọn khoảng cắt qua phổ âm và khoảng lặng, lọc nền trầm, đo loudness/peak. Preview được giao để Lead/Duy duyệt nghe chủ quan; không có đánh giá nghe qua loa/tai nghe trong môi trường agent.
- Bộ chọn ngẫu nhiên dùng PRNG seed hiện có. Không prefetch cả 18 clip: nạp bank của loài được chọn sau tương tác, cache trong vòng đời graph.

## Nối vào index.ts

Không cần sửa `src/features/world/index.ts`: world đã gửi listener và biome qua `ambienceMixAt`, bridge đã bật/tắt theo Sound. Đường nối đang được sử dụng (mẫu 7 dòng):

```ts
const mix = ambienceMixAt({
  bird: birds.listener(physics.position, camera),
  zoneBiome: nearestZone().biome,
  timeOfDay: timeOfDayAt(nearestPath(x, z).t),
  distanceToRiver: nearestRiver(x, z).distance,
  distanceToSea,
});
```

## Clip public

| File | Species | Seconds | Bytes | LUFS | True peak dB |
|---|---|---:|---:|---:|---:|
| tailorbird-1.ogg | tailorbird | 3.200 | 24546 | -25.01 | -10.43 |
| tailorbird-2.ogg | tailorbird | 3.150 | 23329 | -25 | -10.72 |
| tailorbird-3.ogg | tailorbird | 3.600 | 26340 | -24.99 | -11.03 |
| tailorbird-4.ogg | tailorbird | 3.250 | 24096 | -24.93 | -10.62 |
| sparrow-1.ogg | sparrow | 1.300 | 8189 | -25.02 | -11.81 |
| sparrow-2.ogg | sparrow | 1.400 | 8810 | -24.92 | -11.43 |
| sparrow-3.ogg | sparrow | 1.600 | 9550 | -25.05 | -9.08 |
| sparrow-4.ogg | sparrow | 1.500 | 9076 | -25 | -9.38 |
| sparrow-5.ogg | sparrow | 1.700 | 10393 | -25 | -11.47 |
| magpie-robin-1.ogg | magpie-robin | 1.360 | 11507 | -25 | -11.11 |
| magpie-robin-2.ogg | magpie-robin | 1.100 | 9353 | -25.01 | -11.96 |
| magpie-robin-3.ogg | magpie-robin | 1.140 | 9462 | -25.04 | -10.2 |
| bulbul-1.ogg | bulbul | 1.050 | 8422 | -25.06 | -10.1 |
| bulbul-2.ogg | bulbul | 2.050 | 15302 | -25.06 | -9.6 |
| bulbul-3.ogg | bulbul | 1.470 | 11301 | -24.99 | -9.91 |
| gull-1.ogg | gull | 3.300 | 23399 | -25.11 | -11.12 |
| gull-2.ogg | gull | 3.400 | 25576 | -25.01 | -10.86 |
| gull-3.ogg | gull | 2.600 | 19581 | -25.01 | -12.35 |

Opus containers include 6.5 ms decoder pre-skip; audible durations above exclude it.

## Kết quả kiểm tra

Tất cả lệnh dưới đây exit 0 trên bản bàn giao. Dùng `pnpm.cmd` vì PowerShell của máy chặn chạy `pnpm.ps1`.

| Lệnh | Tổng kết | Log trong test-results/audio-birds/ |
|---|---|---|
| `pnpm.cmd lint` | PASS, 0 error / 0 warning | lint.log |
| `pnpm.cmd typecheck` | PASS | typecheck.log |
| `pnpm.cmd test --maxWorkers=1` | `Test Files 183 passed (183)`; `Tests 1898 passed \| 1 skipped (1899)`; 566,34 s | test-workers1.log |
| `pnpm.cmd check:licenses` | `public files: 148`; `RESULT: PASS` | licenses.log |
| `pnpm.cmd build` với hai biến môi trường WASM bên dưới | PASS; **chỉ chạy build đúng một lần** | build.log |
| `E2E_PORT=4498 pnpm.cmd exec playwright test world --workers=2` | `43 passed (6.8m)`; config mặc định Edge/SwiftShader, không sửa config/spec | e2e-world.log |
| `node tools/assets/audio/birds-browser-check.mjs http://127.0.0.1:4499` | PASS online + offline, không request trước Enter World, Opus mono 48 kHz, HRTF, pitch trong biên, mute đóng context, không restart, 0 page error | browser-check.log / browser-check.json |
| `git diff --check` | PASS | — |

Biến build (cmd.exe):

```bat
set "NEXT_TEST_WASM_DIR=C:\Users\PC-LP\AppData\Local\next-swc\wasm\package"
set "NEXT_BUILD_WEBPACK=1"
pnpm.cmd build
```

Lượt unit test mặc định đầu tiên: 18 timeout ở các test world/tools; lượt 2 worker: còn 1 timeout ở ending world. Lượt cuối 1 worker PASS toàn bộ, **không nâng timeout, đổi assertion hay sửa world/config**. Giữ log hai lượt đầu trong `test.log` và `test-workers2.log` để Lead đối chiếu.

Sau khi đủ 43 e2e đã báo PASS, runner còn đợi server ở 4498 khi teardown trên Windows. Đã kiểm tra listener thuộc tiến trình Node do lượt test này tạo, dừng đúng server đó; runner in `43 passed (6.8m)` và exit 0. Server kiểm tra audio 4499 cũng được dọn trong finally. Không chạy lại e2e hoặc build.

Preview `test-results/audio-birds/preview.ogg` là bản ghép chim rừng 30 s từ các clip đã xử lý, có khoảng nghỉ; không phải capture loopback của game. Đã kiểm tra hình Edge online/offline tại First Light; ảnh trong cùng thư mục.

Không commit. Không sửa audio-src, world/index.ts, package/lockfile/config, docs, tests/e2e hoặc tests/perf. Ngoại lệ file sát bên duy nhất là ambience.ts như đã ghi ở trên.
