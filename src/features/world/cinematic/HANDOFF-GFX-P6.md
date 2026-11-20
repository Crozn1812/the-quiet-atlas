# GFX-P6 — cinematic hướng C

Base: `c766002`. Không commit. `index.ts` giữ nguyên.

## Hành vi và file

- `cinematic/intro.ts`: lens 70° → 58° → 48° → đúng FOV gameplay; giữ spline, thời lượng 22 s, phần trời và camera clearance. Frame mang điểm nét theo khoảng cách tới look-at, giảm look cinematic về 0 ở handoff.
- `cinematic/ending.ts`: lens 44° → 56° → 48° → đúng FOV gameplay; giữ các mốc 5/17/29/32/36 s, giữ mặt trời trong khung. Frame mang điểm nét và look hoàng hôn.
- `cinematic/presentation.ts`: profile bình minh/hoàng hôn dùng PALETTE; giảm saturation nhẹ, tách bóng lạnh/highlight ấm, nắng và fill tiết chế.
- `post/cinematic.ts`: balanced (legacy) có Bokeh pass chỉ bật trong cinematic; High giữ DOF idle gameplay. Dùng depth thật chung với AO, không vẽ geometry lần hai. Grading/aperture/blur trở lại mặc định khi xóa cinematic.
- `post/runtime.ts`: **file sát bên ngoài danh sách Được sửa**, cần để nối profile vào pipeline P1: cinematic có DOF khi camera di chuyển, ánh sáng draw-scoped có khôi phục cả khi draw lỗi, Low không cấp post/HDRI. Intro được dùng post sau frame đầu; HDRI/shadow vẫn qua gate deferred cũ. Environment của ending chọn hoàng hôn, trả về time-of-day gameplay khi kết thúc.
- `tests/unit/world/cinematic-c.test.ts`: focus, strength, skip và reduced-motion.
- `tests/unit/world/post-c.test.ts`: moving DOF balanced (legacy)/High trước deferred; xóa look về gameplay; Low không có post/HDRI; phục hồi đèn khi draw lỗi; cập nhật pass list balanced (legacy).
- `cinematic/HANDOFF-GFX-P6.md`: bàn giao này.
- `docs/showcase/38-c/gfx-p6/`: deliverable ảnh/video được ticket yêu cầu; 14 PNG và 2 WebM. Không đổi tài liệu khác.

Không thêm dependency, asset public, request asset, persistence, UI hay phụ đề. Các controller giữ nguyên thời lượng, skip, pause và reduced-motion 0,4/0,6 s. Không thêm điều kiện cho `data-world-build`.

## Lead nối một dòng

Thêm trong `applyCinematicPose(pose, playing)` trước khi render, không cần import:

```ts
paper.setCinematic(playing && !reducedMotion ? pose.cinematic ?? null : null);
```

Lời gọi nhận `null` khi skip, kết thúc hoặc reduced-motion. API mới đã có trên `createGradedPaperPass`. Không gọi `startDeferred` sớm hơn gate gameplay hiện có.

## Lệnh và kết quả

Tất cả chạy trong W-B. Log ở `tmp/gfx-p6/`.

```text
pnpm lint                              exit 0, 0 error / 0 warning (lint-final.log)
pnpm typecheck                         exit 0 (typecheck.log)
pnpm test                              exit 0
  Test Files  160 passed (160)
       Tests  1802 passed (1802)
  Duration  67.13s
NEXT_TEST_WASM_DIR=C:\Users\PC-LP\AppData\Local\next-swc\wasm\package
NEXT_BUILD_WEBPACK=1 pnpm build         exit 0 (build.log), duy nhất một build
E2E_PORT=4286 pnpm exec playwright test tests/e2e/world-intro.spec.ts --workers=1
  3 passed (13.0s), exit 0
PERF_PORT=4287 pnpm test:perf load-budget
  2 passed (2.3m), exit 0
pnpm check:assets
  status=PASS; worldBytes=5193143; startBytes=147096; errors=[]; exit 0
git diff --check                       exit 0
```

Load-budget: Edge 157 / RTX 3060 / i5-14400F, 1366×800, DPR 1; 10 Mbps, RTT 100 ms, 3 cold load mỗi locale. EN: 5,5886 / 5,5716 / 5,6060 s. VI: 5,5679 / 5,5871 / 5,5811 s. Tới playable 2.159.014 B; Welcome/Quick có 0 request 3D trước Enter. Đạt cả trần 6 s cũ. Đây là build chưa nối dòng cinematic trong index; intro không nằm trong phép đo playable của runner. Unit test kiểm gate deferred khi cinematic được nối; ảnh preview chứng minh intro vẫn chạy lúc build pending.

Runner perf hoàn tất hai test rồi treo lúc dọn server trên Windows; đã dừng đúng PID node serve-gzip do runner này tạo (59784). Runner sau đó in tổng kết và thoát 0. Không thay spec/config/assertion.

## Ảnh/video và cách preview

`docs/showcase/38-c/gfx-p6/intro-high/`: 1,5 / 4 / 8 / 12 / 18 / 20,5 s.
`ending-high/`: 1 / 5 / 14 / 22 / 29 / 34 s.
`intro-low/0010s.png`, `ending-low/0026s.png`.
`intro-high.webm`: 32,44 s; `ending-high.webm`: 52,76 s, gồm thời gian vào world. WebM bị gitignore theo quy tắc repo; Lead cần giữ artifact khi chuyển workspace.

Runner `tmp/gfx-p6/capture.mjs` dùng Edge native GPU headless, 1600×900, DPR 1, chọn quality qua event hiện có. Route JavaScript chèn **đúng một lời gọi setCinematic** tương đương đoạn nối trên vào phản hồi mạng; không sửa source index hay file build. Hook thêm chỉ để đọc elapsed/profile khi chụp. `capture.json`: `patched=4`, `errors=[]`, High/Low đúng cả bốn lượt. Ảnh trễ mốc danh nghĩa khoảng 0,08–0,28 s; elapsed thật ghi JSON. Đã xem cả 12 High bằng contact sheet và hai Low. Hai đoạn High chạy tới hoàn tất tự nhiên; hai đoạn Low được skip sau khung kiểm tra.

Playwright thiếu ffmpeg cache; dùng bản ffmpeg đã cài trên máy, sao chép vào cache tạm trong workspace; không tải gì ngoài. Video chứa UI Skip thật của trang.

## Luma gameplay và giới hạn baseline

Đã chạy `tools/review/ingame-shots.mjs` đủ 8 khu trước và sau, `luma.mjs`, `ground-hue.mjs`; exit 0, không pageerror. Ảnh ở `tmp/gfx-p6/before/`, `after/`.

| Khu | out có sẵn trước build | Build ticket | Delta |
|---|---:|---:|---:|
| First Light | 0,224 | 0,227 | +0,003 |
| Workshop | 0,267 | 0,293 | +0,026 |
| Roots | 0,310 | 0,329 | +0,019 |
| Milestones | 0,235 | 0,270 | +0,035 |
| Old Trail | 0,440 | 0,362 | -0,078 |
| Horizon | 0,442 | 0,513 | +0,071 |
| Quiet Shore | 0,318 | 0,319 | +0,001 |
| Last Postcard | 0,337 | 0,338 | +0,001 |

**Chưa chứng minh gate ±0,03**: out có sẵn không được xác nhận cùng HEAD; ảnh Horizon trước/sau có silhouette và vị trí cây khác nhau. Không quy kết các delta đó cho P6, cũng không gọi bảng này PASS. Theo quy định chỉ build một lần, không dựng lại baseline. Gameplay trong ảnh không kích hoạt API cinematic mới; unit test xác nhận grade trở về giá trị cũ khi profile null. Lead cần baseline đúng revision để nghiệm thu luma.

Intro lượt đầu dùng cây fallback hiện có vì GFX-P3 chỉ nạp library sau active gameplay; HDRI P1 cũng giữ deferred. Intro không chờ asset C. Vòm cây và khối đá cũ còn che phần lớn dòng suối ở giữa đoạn; không sửa foliage/landscape của ticket khác để đổi điều đó. Ending dùng hệ đã nạp sau gameplay. Chưa nghiệm thu Iris Xe/T08.

Không thêm geometry hoặc byte asset public. DOF thêm một fullscreen draw khi bật; balanced (legacy) gameplay pass bị disable. Đây là phân tích pipeline, chưa phải số draw/triangle đo GL trước/sau trên baseline cùng revision.

## CPU ABBA

Đã chạy tuần tự main 4180 → ticket 4286 → ticket 4286 → main 4180, balanced (legacy), 1366×800, Edge native GPU. Dùng bản sao `tools/review/cpu-compare.mjs` ở `tmp/gfx-p6/cpu-compare.mjs`, chỉ thay đường resolve package cứng `D:/the-quiet-atlas` thành cwd W-B. Bốn lượt exit 0; log `cpu-0.log` tới `cpu-3.log`. Mỗi vùng đi bộ khoảng 4 s, tính theo CDP Timestamp thật.

| Khu | Main script A1/A2 | Ticket script B1/B2 | Delta trung bình | Delta task trung bình |
|---|---:|---:|---:|---:|
| First Light | 310 / 227 | 332 / 256 | +25,5 ms/s | +25,0 ms/s |
| Roots | 266 / 204 | 258 / 220 | +4,0 ms/s | +2,5 ms/s |
| Workshop | 321 / 264 | 343 / 283 | +20,5 ms/s | +21,0 ms/s |

Trung bình ba vùng: **+16,7 ms/s script, +16,2 ms/s task**, vượt trần +10 ms/s. **Chưa đạt gate CPU**. Số đo dao động lớn giữa hai lượt cùng bản; revision của server main chưa xác minh. Không có phép đo đủ để quy kết chênh lệch cho code P6 hay cho khác biệt baseline/asset. Không đổi các hệ foliage/water của ticket khác để hợp thức hóa kết quả. Các phép đo này là gameplay chưa nối cinematic, không chứng minh chi phí GPU của DOF balanced (legacy) khi cinematic hoạt động.

Bàn giao source đã qua ba gate bắt buộc và preview đủ ảnh/video; còn mở gate CPU/luma, đo GL cùng revision và nghiệm thu Iris Xe. Lead cần nối dòng API trên để bật look/DOF cinematic trong ứng dụng.
