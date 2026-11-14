# HR-BIRDS — bàn giao vòng trả lại 1

Ngày 2026-11-14. Không commit, không rebase. Tiếp tục phần W-D đã được Lead áp dụng sẵn.

## Phần sửa trong lượt này

- `geometry.ts`: một bề mặt liên tục từ thân lên đầu, thay các khối cầu chồng nhau; mắt nhỏ nằm sát đầu; má, mảng tai và yếm là vertex color; ngón chân có khớp bám cành; đuôi và lông cánh thuôn; rest pose gấp cánh sát sườn. Shader vẫn đập cánh/lượn và lọc chi tiết lông theo khoảng cách.
- `perches.ts` (mới): tìm cả ba variant thân cây First Light mà HR-TREE2 dùng làm root, chọn prefix còn tồn tại khi chuyển Low; bổ sung cành cong, thuôn và có nhánh phụ hướng ra đường. Ba chim đậu có ba bộ màu riêng. Các cành gộp thành một draw.
- `birds.ts`: ba batch chim đậu riêng để giữ bộ màu; giữ bay theo đàn, cull khoảng cách, Low giảm đàn bay; bỏ clone Vector3 trong vòng tìm nguồn âm. Không đổi API nối world.
- `tests/unit/world/birds.test.ts`: kiểm tra ba bộ màu/batch, giữ chim đậu ở Low, vị trí cành trên địa hình thật, nguyên vẹn root khi đổi chất lượng, giải phóng tài nguyên; giữ các test bay/đậu và ABBA opt-in.

Các file đã có từ W-D, giữ trong bàn giao: `src/features/audio/{birds,ambience,mix}.ts`, `src/features/world/fauna/flight.ts`, `tests/unit/audio/audio.test.ts`, đúng 5 dòng nối trong `src/features/world/index.ts`.

Không sửa package/lock/config, content, docs, e2e/perf. Harness/ảnh/log chỉ ở thư mục bỏ qua git `tmp/hr-birds-r1/`.

## Âm thanh thật — BLOCKED

Không tải được bản thu trong sandbox. Hai host trả lỗi kết nối:

```text
curl.exe -I --max-time 20 https://freesound.org/people/soumen59/sounds/478637/
curl: (7) Failed to connect to freesound.org:443
curl.exe -I --max-time 20 https://cdn.freesound.org/previews/478/478637_10013160-hq.ogg
curl: (7) Failed to connect to cdn.freesound.org:443
```

URL CDN ở trên chỉ là phép thử kết nối host, chưa xác minh là URL file đúng. Không dùng nó làm nguồn asset.

Giữ nguyên fallback tổng hợp theo ngoại lệ ticket: HRTF/PannerNode, khoảng cách cây, chiều thưa hơn, chỉ sau nút Sound, tắt tiếng giải phóng toàn bộ node. Chưa có loader bản thu hoặc file OGG/Opus; **không tuyên bố đã nghe/biên tập/tích hợp bản thu thật**. Không thêm dòng LICENSES cho file không tồn tại. Public asset thêm: **0 byte**.

Các nguồn ứng viên đã xác minh nhãn **Creative Commons 0 trên trang từng sound** qua công cụ web; chưa tải và chưa nghe. Loài theo mô tả tác giả, không tự xác định từ âm thanh:

| Loài/âm | Tác giả | License | URL nguồn | File public đã có |
|---|---|---|---|---|
| Oriental magpie robin / chích chòe | soumen59 | CC0 | https://freesound.org/people/soumen59/sounds/478637/ | Chưa có |
| House sparrow | TheKingOfGeeks360 | CC0 | https://freesound.org/people/TheKingOfGeeks360/sounds/861888/ | Chưa có |
| Spotted turtle dove | elle-trudgett | CC0 | https://freesound.org/people/elle-trudgett/sounds/147349/ | Chưa có |
| Collared dove | D4XX | CC0 | https://freesound.org/people/D4XX/sounds/607243/ | Chưa có |
| Asian koel | ramblinglibrarian | CC0 | https://freesound.org/people/ramblinglibrarian/sounds/460466/ | Chưa có |
| Seagull, bản thu sân vườn | AlienXXX | CC0 | https://freesound.org/people/AlienXXX/sounds/798340/ | Chưa có |

Khi mạng khả dụng, cần nghe chọn câu, cắt 1–4 giây, mono Opus 48–64 kbps, bổ sung từng dòng LICENSES có tác giả và URL, thêm loader sau Enter World/Sound và test hủy tải/mute trước khi thay fallback. Danh sách này không thay cho các bước đó.

## Tích hợp

`index.ts` đã nối đúng 5 dòng từ lượt W-D, giữ nguyên. Không cần Lead thêm lần nữa:

```ts
import { createBirds } from "./fauna/birds";
const birds = createBirds(scene); dressing.defer(birds.build);
// Trong AmbienceInputs:
bird: birds.listener(physics.position, camera),
// Trong update và dispose:
birds.update(animDt, reducedMotion, player.position, quality);
birds.dispose();
```

## Giới hạn hình ảnh

Đã cải thiện giải phẫu và kiểm tra ảnh High trong world, gồm góc cận và góc mắt thường cách khoảng 11 m; Low vẫn có chim đậu. Mô hình là geometry/shader gốc trong mã, không phải model tải ngoài, không có GLB/KTX2 mới. Chưa có đánh giá mù so với ảnh thật; không tự chấm đạt ngưỡng photoreal. Chỉ First Light có chim đậu; các khu còn lại giữ đàn bay và chim biển từ phần W-D.

Root cây ổn định theo HR-TREE2, còn cành đậu là geometry bổ sung của ticket này, không đọc skeleton hay vị trí cành từ GLB từng loài cây. Vỏ cành dùng vertex color, không texture vỏ 2K. Nền thế giới/LOD ngoài fauna không thuộc phạm vi sửa.

## Kiểm chứng

```text
pnpm.cmd lint                         exit 0; 0 warning
pnpm.cmd typecheck                    exit 0
pnpm.cmd test                         exit 0
  Test Files  180 passed (180)
       Tests  1909 passed | 1 skipped (1910)
    Duration  77.42s
NEXT_TEST_WASM_DIR=C:\Users\PC-LP\AppData\Local\next-swc\wasm\package
NEXT_BUILD_WEBPACK=1 pnpm.cmd build    exit 0; build đúng một lần
  Compiled successfully in 3.9s
  Generating static pages (22/22)
E2E_PORT=4186 pnpm.cmd exec playwright test world --workers=2
  43 passed (6.9m)                     exit 0
git diff --check                      exit 0
```

E2e dùng nguyên `playwright.config.ts`, kênh msedge/SwiftShader mặc định, chỉ đổi cổng server của worktree. Không sửa test e2e. Một lượt unit ban đầu timeout 15 s ở test placement First Light dưới tải song song; chạy lại nguyên `pnpm test`, không sửa config/test, PASS như trên. Test skipped duy nhất là ABBA opt-in có sẵn trong birds.test.ts; số đo bên dưới dùng harness riêng.

Log: `tmp/hr-birds-r1/{lint-final,typecheck,test-final,build,e2e-world}.log`; lượt unit timeout giữ ở `test.log`.

## Số đo fauna tại First Light

`node tmp/hr-birds-r1/cpu.mjs`, sau e2e, 500 update warm-up mỗi quality, mỗi đoạn ABBA 4.000 update. A: vòng control, B: `birds.update(1/60, false, player, quality)`. Không gồm GPU, Web Audio hay render toàn thế giới; máy vẫn là workstation dùng chung.

| Số đo | High | Low |
|---|---:|---:|
| Tam giác/bird | 27.048 | 2.288 |
| Chim trong batch đủ gần để bật | 21 (gồm đàn Workshop ở bán kính 95 m) | 6 |
| Tam giác fauna, gồm cành | 569.160 | 14.880 |
| Draw fauna, gồm một draw cành | 6 | 5 |
| CPU A1/B1/B2/A2, ms/update | 0,000050 / 0,028781 / 0,023774 / 0,000009 | 0,000010 / 0,033090 / 0,014621 / 0,000007 |
| CPU delta B−A, ms/update | 0,026248 | 0,023847 |
| Byte public thêm | 0 | 0 |

Đây là số tam giác/batch được bật theo khoảng cách, chưa trừ clipping/frustum. Buffer geometry của tất cả đàn High + Low được giữ trong RAM: **14.893.160 byte**, chưa gồm cành/instanceMatrix. Mã nguồn runtime fauna tăng **6.364 byte UTF-8** so với bản W-D được giao (không phải byte bundle/gzip). Không thêm file GLB, texture hay âm thanh.

## Số đo trình duyệt trên bản build

`node tmp/hr-birds-r1/metrics.mjs`, Edge headless, viewport 1600×900, renderer **ANGLE NVIDIA GeForce RTX 3060 / D3D11**, một phiên riêng sau e2e. Warm-up 4 s mỗi quality, lấy mẫu tiếp 7 s. Đây là workstation dùng chung, không phải laptop Iris Xe và không phải benchmark cô lập toàn máy.

| Số đo toàn thế giới tại spawn | High | Low |
|---|---:|---:|
| FPS render quan sát được | 19,38 | 99,90 |
| Draw/frame trung vị, gồm shadow và post | 380 | 137 |
| Tam giác/frame trung vị, gồm shadow và post | 5.958.343 | 339.222 |

Draw/triangle đo bằng đếm lời gọi WebGL (kể cả các pass), không đồng nhất với `renderer.info` của riêng pass scene. FPS tính số frame có draw trong khoảng đo; không dùng số callback rAF thay cho số frame render. **High còn chậm**, chưa có ABBA bật/tắt fauna trên toàn renderer để quy chi phí GPU riêng cho chim.

- Enter World → `data-app-mode=world` + intro done: **12.745 ms**, QA bật `__tqaSkipIntro`.
- Enter World → hoàn tất deferred dressing (`data-world-build=done`): **22.698 ms**.
- Body byte nhận sau Enter đến lúc chơi: **5.914.640**; tính cả Welcome: **6.484.804**.
- Tổng body byte cả phiên sau streaming, High rồi Low: **62.771.908**. Là toàn thế giới, không phải byte mới của ticket.
- JSON gốc/harness: `tmp/hr-birds-r1/{browser-metrics.json,metrics.mjs,cpu-geometry.json,cpu.mjs}`.

## Ảnh

Ảnh/log nằm trong `tmp/hr-birds-r1/`, không thêm vào public hay docs. Bộ trước chụp mã W-D được bàn giao qua dev server; bộ sau chụp static export vừa build. Không có build baseline bổ sung. Dùng cùng viewport 1600×900, QA bỏ intro, pin High; pose forest sau đọc đúng tọa độ pose trước. Lá/đàn bay vẫn chuyển động nên pixel không trùng tuyệt đối. Thời gian dev ở capture trước không dùng để so sánh hiệu năng với production.

- `before/high-forest.png` ↔ `after/high-forest.png`: High cùng pose cố định; thêm `high-gameplay.png` ở mỗi thư mục.
- `after/perch-detail-{0,1,2}.png`: ba bộ lông trên cành trong world.
- `after/perch-normal.png`: camera ở vị trí spawn, ngang mắt, nhìn về chim đậu khoảng 11 m; khác hướng camera gameplay mặc định.
- `after/perch-gameplay.png`: camera chơi thường, chỉ xoay bằng ArrowLeft/ArrowRight tại spawn để nhìn về cành; không postcard, không đổi vị trí người chơi hoặc zoom. Metadata ở `after/gameplay.json`, quality High, 0 page error.
- `after/low-gameplay.png`, `after/low-perch-detail-0.png`: Low tổng cảnh và cận chim còn trên cành.
- `model-before-{0,1,2}.png` ↔ `model-after-{0,1,2}.png`: so sánh geometry High tại cùng camera/ánh sáng trong harness riêng, không phải ảnh world.
- Harness: `capture.mjs`, `detail.mjs`, `gameplay.mjs`, `model.html`, `model-shots.mjs`, `preview-server.mjs`; metadata ảnh: `before/capture.json`, `after/{capture,details}.json`.
