# Ngân sách tải cold-cache (§8, Q18, T08 phần mạng) + Lighthouse CI — 2026-11-04

- Ticket: L3-004, nhánh `lane/L3-004` (gốc `0077392`)
- Đo lúc: 2026-11-04 01:08 (UTC+7) — `measuredAt` 2026-11-03T18:08:37Z
- Server: `out/` qua `tools/load-budget/serve-gzip.mjs` = quy tắc định tuyến `tools/serve-out` + nén gzip kiểu CloudFront (chỉ text, 1 000 B – 10 000 000 B, khi trình duyệt gửi `Accept-Encoding: gzip`) trên `127.0.0.1`. **Không phải CDN thật.** gzip thay brotli có chủ ý: §8 ghi ngân sách JS theo gzip; brotli nhỏ hơn nên số đo là bảo thủ.
- Ngưỡng: giữ nguyên §8 (KB = 1024 B, MB = 1024 KB — cùng quy ước `tools/check-bundle`). Số đo cũng đạt nếu tính theo hệ thập phân (1 MB = 1 000 000 B, 150 KB = 150 000 B).

## Máy đo (ADR 0007)

| Mục | Giá trị |
|---|---|
| Nhãn | **desktop dGPU RTX 3060** |
| CPU | Intel Core i5-14400F (16 luồng logic) |
| GPU | NVIDIA GeForce RTX 3060 (driver 32.0.16.2101); WebGL: `ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| RAM | Windows báo 32 GB tổng dung lượng thanh RAM (ADR 0007 ghi 36 GB — cần Duy xác nhận) |
| OS | Windows 11 Pro 10.0.26200 x64 |
| Trình duyệt | Microsoft Edge 156.0.4314.58 (Playwright `channel: msedge`, headless, GPU thật — không SwiftShader) |
| Nguồn điện | Desktop cắm điện; power plan Windows "Balanced" (`381b4222-…`) |
| Viewport / DPR | 1366×800 / 1.0 |
| Chất lượng | Balanced (mặc định của `WorldEntry`, chưa chọn được từ UI) |
| Node / Playwright | v26.13.0 / @playwright/test 1.64.1 |

## Phương pháp

- Lệnh: `pnpm build` rồi `pnpm exec playwright test -c tests/perf/playwright.perf.config.ts` (spec `tests/perf/load-budget.perf.ts`, hàm thuần `tools/load-budget/index.mjs`).
- 3 lần cold load; **mỗi lần một tiến trình Edge mới + context mới**, CDP `Network.setCacheDisabled(true)`, `Network.emulateNetworkConditions`: 10 Mbps xuống / 10 Mbps lên / RTT (latency) 100 ms.
- Byte = `Network.loadingFinished.encodedDataLength` (byte nén thực nhận, gồm header HTTP). CV (`.pdf`) không tính.
- Welcome `/en/` và Quick `/en/quick/`: mọi request từ lúc điều hướng tới khi mạng yên (không request mới trong 1 s và mọi request đã xong; tối đa 20 s). Welcome tính tới trước click Enter World.
- "3D trước Enter World" = request có đuôi `.glb/.gltf/.wasm/.ktx2/.basis/.drc`, MIME `model/*`, `application/wasm`, `image/ktx2`, hoặc JS có chữ ký `__TQA_WORLD_CHUNK__` (marker world), `__THREE__` (three.js), `AGFzbQ` (WASM nhúng base64, ví dụ Rapier). Body JS đọc bằng `Network.getResponseBody`.
- **Định nghĩa "player controllable"** dùng cho gate: phần tử chứa world có `data-world-chunk="__TQA_WORLD_CHUNK__"`, `<canvas>` bên trong đã nhận ≥ 1 lệnh vẽ WebGL (`drawArrays/drawElements/…Instanced/drawRangeElements`) **và** animation frame kế tiếp đã bắt đầu (frame đó đã giao cho compositor). Mốc thời gian = đầu frame kế tiếp; mốc bắt đầu = sự kiện `click` trên nút "Enter World" (đo trong trang, `performance.timeOrigin + now()`). Byte 3D = mọi request **bắt đầu** trong [click, controllable], cộng đủ byte kể cả phần về sau mốc. Không kiểm phím WASD có làm nhân vật di chuyển (headless không focus cửa sổ nên mô phỏng bị pause) — chỉ đo "đã hiển thị world".

## Kết quả gate (§8) — gate theo lần xấu nhất

| Gate (§8) | Ngưỡng | Lần 1 | Lần 2 | Lần 3 | Xấu nhất | Kết quả |
|---|---|---|---|---|---|---|
| Welcome /en/ initial transfer | ≤ 1.00 MB | 147.5 KB (151060 B) | 147.5 KB (151060 B) | 147.5 KB (151060 B) | 147.5 KB (151060 B) | **PASS** |
| Welcome /en/ JS (gzip) | ≤ 150.0 KB | 141.8 KB (145173 B) | 141.8 KB (145173 B) | 141.8 KB (145173 B) | 141.8 KB (145173 B) | **PASS** |
| Quick /en/quick/ initial transfer | ≤ 1.00 MB | 146.1 KB (149624 B) | 146.1 KB (149624 B) | 146.1 KB (149624 B) | 146.1 KB (149624 B) | **PASS** |
| Quick /en/quick/ JS (gzip) | ≤ 150.0 KB | 141.8 KB (145173 B) | 141.8 KB (145173 B) | 141.8 KB (145173 B) | 141.8 KB (145173 B) | **PASS** |
| Welcome /en/ 3D requests before Enter World | = 0 | 0 | 0 | 0 | 0 | **PASS** |
| Quick /en/quick/ 3D requests (toàn trang) | = 0 | 0 | 0 | 0 | 0 | **PASS** |
| 3D bytes Enter World → playable | ≤ 8.00 MB | 1.70 MB (1785469 B) | 1.70 MB (1785469 B) | 1.70 MB (1785469 B) | 1.70 MB (1785469 B) | **PASS** |
| Time to playable | ≤ 10 s | 1.98 s | 1.95 s | 1.98 s | 1.98 s | **PASS** |

Tổng: **PASS** trên máy "desktop dGPU RTX 3060", server local (không phải CloudFront).

Chi tiết (giống nhau cả 3 lần):

- Welcome: 11 request — HTML 4 960 B, CSS 927 B, JS 145 173 B, font 0, ảnh 0. Quick: 10 request — HTML 3 524 B, CSS 927 B, JS 145 173 B. **JS dùng 94,5 % ngân sách 150 KB** — rủi ro khi L1 thêm code.
- Enter World → playable: 4 chunk JS — `09cfat12zn89n.js` 1 645 252 B (Rapier, WASM nhúng base64), `1_6t_u8b6qrrn.js` 86 937 B (world, có marker), `3-oo-po86n5xm.js` 52 713 B (three.js), `0c0n948djp8by.js` 567 B. Chưa có GLB/texture.
- Click → lệnh vẽ đầu tiên: 1,86–1,88 s; + 1 frame ≈ 0,1 s.
- Không có cảnh báo (body JS đọc được hết, mạng yên trước 20 s).

### Tham khảo — "mô phỏng máy yếu" (ADR 0007 §4, **không phải gate**)

`PERF_CPU_THROTTLE=4` (CDP CPU throttling 4×), DPR 1.0, chất lượng Balanced (chưa có lựa chọn Low trong UI): byte giống hệt; time to playable 2,54 / 2,56 / 2,54 s (xấu nhất 2,56 s).

## Lighthouse CI (lab, §8 "Quick web UX")

- Lệnh: `$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"; pnpm exec lhci autorun` (`lighthouserc.cjs`). @lhci/cli 0.15.1, Lighthouse 12.6.1, Edge 156 headless; không tải Chrome.
- Profile mặc định Lighthouse (mobile, slow 4G giả lập, CPU 4×); 3 lần/URL, assert theo lần xấu nhất (`pessimistic`). Báo cáo lưu `test-results/lhci/` (local), **không upload** (target `filesystem`).
- INP không đo được trong lab navigation → **TBT là proxy lab cho INP** (TBT ≤ 200 ms). INP field p75 báo riêng sau launch.
- `lhci autorun` exit 0 (mọi assertion đạt).

| URL | LCP (3 lần → xấu nhất) | CLS (xấu nhất) | TBT (xấu nhất) | Accessibility score | Kết quả |
|---|---|---|---|---|---|
| `/en/` | 2040 / 2035 / 2050 ms → **2,05 s** | 0,0146 | 37 ms | 0,95 (ghi nhận, không gate) | **PASS** (LCP, CLS, TBT-proxy) |
| `/en/quick/` | 2039 / 2035 / 1883 ms → **2,04 s** | 0 | 36 ms | 1,00 | **PASS** |
| `/en/projects/cms-devops-platform-aws-eks/` | 2039 / 1803 / 2050 ms → **2,05 s** | 0 | 47 ms | 1,00 | **PASS** |

Ghi chú: accessibility 0,95 ở `/en/` do audit `target-size` (đã có trong KNOWN_ISSUES của e2e, lane L1). LCP `/en/` là `<p id="world-reason">`; CLS 0,0146 đến từ `<section aria-labelledby="contact">`. LCP ~2,0 s / ngưỡng 2,5 s dưới profile mobile — biên độ ~0,45 s.

## Giới hạn

- Server local, không phải CloudFront/tên miền thật; RTT giả lập ở tầng request của Chromium (như DevTools), không phải tầng gói tin.
- Mới đo `en`; `vi` chưa đo (cùng bundle JS).
- Hàng §8 "Toàn bộ thế giới ≤ 30 MB", FPS/frame time (T08 phần render), stability: NOT RUN (ngoài ticket).
