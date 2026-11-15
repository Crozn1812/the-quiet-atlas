# HR-FIX-TERRAIN — bàn giao W-C

Tiếp tục phần việc có sẵn tại HEAD `35873e98a534919ca73aac2279ba3a027e5e2d54`. Không commit.

## Thay đổi

- Núi xa dùng depth thật để giữ che khuất giữa các dãy và tiền cảnh. Bỏ copy/reset depth về trời; giữ thứ tự sau mặt biển và trước surf/light ribbons.
- High dùng lưới liên tục 4 m thay vì 8 m; vai núi chuyển mềm hơn. Bổ sung chi tiết tán rừng, khoáng đá, normal và ánh sáng theo địa hình; tái sử dụng ảnh CC0 2K `/world/cliff/cliff-color.ktx2` sau gate playable trên GPU thật.
- Material địa hình High hiện có chuyển pigment và sương liên tục sang backdrop ở phần sườn xa. Mask đường, nước và bãi biển vẫn được giữ.
- Vùng hạ backdrop dưới hành lang có thêm 48 m chuyển tiếp mềm. Dò pixel tại Old Trail overview đã xác định mặt chéo là backdrop bị cắt từ khoảng 25 m xuống 7 m trong một ô 4 m; không phải mặt collider. Test hồi quy kiểm tra đúng vùng vai đồi này và các test cũ vẫn kiểm tra cả index High/Low nằm dưới hành lang.
- Vách đầu suối giảm các hõm/gờ uốn lớn thành lớp khoáng ngắt quãng dưới mét. Thu nhỏ tỉ lệ triplanar/normal, giảm warp và vệt weather quá lớn; giữ texture CC0 hiện có.
- Low và software renderer dùng shader rẻ và 32.768 tam giác backdrop. Low vẫn chia sẻ buffer/CPU construction lớn hơn với High; không có một lưới CPU Low riêng.
- Giữ collider/heightfield, route, vị trí tương tác, nội dung và vòng đời streaming/disposal hiện có.

## File

Runtime (6):

- `src/features/world/scene/far-landscape.ts`
- `src/features/world/scene/far-material.ts`
- `src/features/world/scene/far-relief.ts`
- `src/features/world/terrain/cliff-relief.ts`
- `src/features/world/terrain/cliffs.ts`
- `src/features/world/zones/first-light-cliff-detail.ts`

Unit (4):

- `tests/unit/world/far-landscape.test.ts`
- `tests/unit/world/far-material.test.ts`
- `tests/unit/world/terrain-cliff.test.ts`
- `tests/unit/world/terrain-cliffs-lifecycle.test.ts`

Review (5): file này và `tests/review/hr-fix-terrain{,-checks,-cpu,-report}.mjs`.

Không có file ngoài phạm vi. Không thêm public asset, dependency, license row hoặc trạng thái persistent. Snapshot, log, ảnh và export build nằm trong artifact ignored.

## Nối vào index.ts

Không cần thêm hook. Giữ wiring hiện có của far landscape và chuỗi `bindTerrainDetail → createPhotoSurfaces → createTerrainCliffs`. Ví dụ phần far hiện có (không tạo thêm owner thứ hai):

```ts
farLandscape = createFarLandscape({ deferred: true });
scene.add(farLandscape.mesh);
dressing.defer(farLandscape.build);
// Trong frame:
farLandscape.setFirstLightView(
  cinematicLocked() ? 0 : firstLightGroveWeight(physics.position.x, physics.position.z),
);
// Teardown:
farLandscape.dispose();
```

## Gate bản cuối

Các lệnh chạy bằng `pnpm.cmd` trên PowerShell. Full unit dùng timeout mặc định, không có override 60 giây:

```text
pnpm.cmd lint                                      exit 0, 0 warning
pnpm.cmd typecheck                                 exit 0
pnpm.cmd test --maxWorkers=2                        exit 0
  Test Files  202 passed (202)
       Tests  2034 passed | 1 skipped (2035)
    Duration  276.24s
pnpm.cmd check:assets                              exit 0, PASS (report-only)
pnpm.cmd check:licenses                            exit 0, RESULT: PASS, 221 public files
pnpm.cmd build                                     exit 0, 23.704s
pnpm.cmd exec playwright test world --workers=2     exit 0, E2E_PORT=4203
  43 passed (5.3m)
```

Build WASM/webpack **một lần sau thay đổi code cuối**, ID `183QG707FwfoaxzmI5ukN`. Runner đặt `NEXT_TEST_WASM_DIR=C:\Users\PC-LP\AppData\Local\next-swc\wasm\package` và `NEXT_BUILD_WEBPACK=1`; lưu SHA256 của cả sáu file runtime trong `gates.json` để đối chiếu ảnh production.

Lượt e2e PASS dùng server riêng: mở `node tools/serve-out/index.mjs out --port 4203`, rồi đặt `$env:E2E_PORT='4203'` và chạy lệnh test trên ở terminal khác. Config mặc định tái dùng server. Lượt đầu cũng có đủ 43 dòng passed nhưng kẹt sau test, chưa trả exit code; đã dừng đúng tiến trình của lượt đó, giữ log `e2e-first-all-passed-teardown-hang.log` và chạy lại trên cùng build. Không sửa config/test e2e, không dùng cổng 4173 và không dừng server của worker khác.

## Bằng chứng và phương pháp

- [Gallery ba nguồn cùng camera](../../test-results/hr-fix-terrain/index.html): audit gốc `1877a57`, HEAD trước ticket, build sau sửa. 12 pose gồm 11 High và 1 Low; có ba pose Horizon đúng vị trí Lead và dịch ±0,6 m.
- [So sánh số đo và SHA256 ảnh](../../test-results/hr-fix-terrain/comparison.json), [gate + build ID/hash source](../../test-results/hr-fix-terrain/gates.json), [CPU ABBA](../../test-results/hr-fix-terrain/cpu-abba.json).
- Ảnh trước ticket có sẵn từ source preview Vite. Đã đối chiếu snapshot của cả sáu file runtime với `git show HEAD:<file>`: khớp sau chuẩn hóa CRLF. Không dựng lại build trước.
- Script review tái sử dụng camera, chụp ảnh và đo của `tools/review/hr-audit.mjs`; Edge headed, 1600×900, DPR 1, kiểm tra renderer RTX 3060, không dùng SwiftShader cho ảnh/FPS. Script dùng cổng 4503 cho source preview; production/e2e dùng riêng 4203.
- Mỗi pose chờ network idle + 3,5 giây rồi đo 3 giây; lúc bắt đầu High còn chờ thêm 45 giây để detail nạp xong. CPU ABBA construction đã chạy lại sau sửa vùng chuyển tiếp; không chạy lint/build/unit/e2e của slot này đồng thời với đo GPU.
- Draw/tam giác là tổng mọi pass trong một rendered frame. FPS là rAF; manifest cũng giữ rendered FPS, p95 và CDP main-thread task ms/s. Không phải benchmark máy được cô lập khỏi worker khác.
- Timer startup trước dùng source preview, sau dùng Enter World của production; chỉ ghi nhận hai số, không suy ra chênh lệch startup production từ hai môi trường này.
- Audit gốc chứa các lỗi foliage/props đã được sửa ở HEAD trước ticket. Không quy mọi khác biệt giữa audit và ảnh sau cho patch này.

## Rà ảnh theo mục audit

Đã mở xem đủ 12 ảnh trước ticket và 12 ảnh production sau sửa ở kích thước 1600×900. Report xác minh 36 file ảnh của ba nguồn, 12 cặp trước/sau trùng camera/target/quality, build ID và SHA256 source khớp build cuối; không có console error hoặc failed request trong hai lượt capture đối chiếu. Raw manifest giữ trạng thái lúc capture; bảng này là ghi nhận rà các lỗi được giao, không tự duyệt mức siêu thực toàn cảnh.

| Mục | Đã sửa / quan sát sau sửa | Góc kiểm tra | Còn lại và lý do |
|---|---|---|---|
| A02 | Hết mảng trắng tam giác lớn; vách chéo nhân tạo ở rìa vùng hạ backdrop đã trở thành vai đồi chuyển tiếp. Depth thật giữ che khuất tiền cảnh và các dãy. | Old Trail overview/close/path, horizon-left-holes | Không thấy lại lỗi được giao ở các pose này. Các props/foliage khác trong ảnh thuộc ticket riêng. |
| A22 | Sườn xa có chi tiết tán/khoáng và ánh sáng theo địa hình; vai/đỉnh mịn hơn, hết dải trắng lớn ở núi ven biển. | Old Trail path, Quiet Shore overview, sea-wide | Lead tiếp tục đánh giá chất lượng siêu thực tổng thể ở ảnh gốc; không có phép so sánh benchmark máy cô lập. |
| A23 — vách | Hết các nếp/hõm uốn cỡ lớn; còn hạt đá, khe và lớp khoáng nhỏ hơn theo mét. | signpost, first-light-overview | Dải nước/thác vẫn còn dạng ribbon/mặt phẳng; `terrain/spring.ts` bị loại khỏi phạm vi ticket này. |
| A01 — theo dõi | Chưa tái hiện các lỗ tròn màu trời tách bạch ở sườn trái. | horizon-lead-match/left/right, horizon-left-holes | Giữ trạng thái chưa tái hiện; không ghi là đã sửa và không mở rộng sang foliage của ticket khác. |

## Số đo các pose audit

High thấp nhất **65,56 FPS ≥ 60 FPS**, Low khoảng 100 FPS trên RTX 3060. Mỗi số là trung bình 3 giây/pose; p95 và rendered FPS nằm trong manifest.

| Pose | FPS trước → sau | Tam giác mọi pass trước → sau | Draw mọi pass trước → sau | CPU task ms/s trước → sau |
|---|---:|---:|---:|---:|
| first-light-overview (high) | 67,7 -> 65,6 | 20.836.150 -> 21.236.214 | 919,0 -> 920,0 | 691,1 -> 681,8 |
| old-trail-overview (high) | 100,0 -> 100,0 | 5.671.985 -> 6.065.201 | 245,0 -> 245,0 | 366,9 -> 362,6 |
| old-trail-close (high) | 100,0 -> 100,0 | 6.726.485 -> 7.119.701 | 237,0 -> 237,0 | 391,4 -> 398,0 |
| old-trail-path (high) | 100,0 -> 100,0 | 6.269.543 -> 6.662.759 | 209,0 -> 209,0 | 356,7 -> 365,9 |
| quiet-shore-overview (high) | 100,0 -> 100,0 | 4.139.840 -> 4.533.056 | 216,0 -> 216,0 | 340,2 -> 353,3 |
| sea-wide (high) | 100,0 -> 100,0 | 3.310.129 -> 3.703.345 | 137,0 -> 137,0 | 316,2 -> 307,0 |
| signpost (high) | 100,0 -> 100,0 | 8.436.126 -> 8.832.860 | 501,0 -> 502,0 | 757,2 -> 783,8 |
| horizon-left-holes (high) | 100,0 -> 100,0 | 5.547.450 -> 5.937.196 | 214,2 -> 214,0 | 339,2 -> 347,0 |
| low-first-light (low) | 100,0 -> 100,0 | 360.804 -> 360.804 | 127,0 -> 127,0 | 464,8 -> 448,9 |
| horizon-lead-match (high) | 100,0 -> 100,0 | 5.646.702 -> 6.017.214 | 304,0 -> 303,0 | 391,2 -> 398,3 |
| horizon-lead-left (high) | 100,0 -> 100,0 | 5.879.902 -> 6.250.414 | 305,0 -> 304,0 | 390,1 -> 408,2 |
| horizon-lead-right (high) | 100,0 -> 100,0 | 5.619.188 -> 5.994.398 | 301,0 -> 302,0 | 382,6 -> 389,5 |

Production từ Enter World: playable/intro-done **4.815 ms**, dressing build-done **16.949 ms**; response body tới build-done **10.366.072 B**, tổng session 12 pose **228.564.465 B**. Source preview trước: 4.990 / 14.314 ms; tới build-done 30.478.372 B. Byte được tính từ page navigation, timer bắt đầu ở Enter World hoặc source preview; không dùng hai môi trường này để suy ra chênh lệch startup production.

## Chi phí construction

| Số đo | Trước | Sau |
|---|---:|---:|
| Backdrop High, tam giác | 131.072 | 524.288 |
| Backdrop Low/software, tam giác | 32.768 | 32.768 |
| Backdrop, draw màu | 1 | 1 |
| Buffer geometry CPU/GPU, byte dữ liệu | 5.136.432 | 19.316.784 |
| CPU construction ABBA trung bình, ms | 883,5 | 3.281,0 |
| Public asset mới, byte | — | 0 |

CPU ABBA: A1 860 ms, B1 3.281 ms, B2 3.281 ms, A2 907 ms; warm Node construction, không phải thời gian frame trên GPU. Buffer tăng 14.180.352 B. Construction runtime tiếp tục dùng generator hiện có; intro/ending có đoạn drain đồng bộ từ wiring hiện có.

Ảnh đá được dùng thêm cho backdrop là file có sẵn 3.169.735 B, 2048×2048, 12 mip levels; request có thể dùng cache trình duyệt. Bảng buffer trên chỉ đếm geometry; không phải tổng VRAM của decoder/texture/framebuffer. Chưa đo VRAM riêng của texture sau transcode.

## Giới hạn

- Nghiệm thu mức siêu thực cần Lead xem ảnh ở kích thước gốc; gate số không tự duyệt art.
- A23 ở đây chỉ sửa vách. Dải nước/thác của `terrain/spring.ts` thuộc ticket khác và nằm ngoài phạm vi được sửa.
- A01 là lỗi lịch sử cần theo dõi; không được gọi là đã sửa nếu các ảnh đúng pose không tái hiện được lỗi.
- Software e2e ở lượt PASS ghi `build=done` sau khoảng 18,4–42,1 giây ở các ca xe. Đây là thời điểm hoàn tất dressing deferred trên SwiftShader, không phải FPS hoặc timer playable của RTX 3060. Low/software vẫn có chi phí construction/buffer chung như bảng trên.
- Lượt unit 4 worker ban đầu có 9 timeout 15 giây. Giảm về 1 worker vẫn gặp timeout mount/remount world; đã giữ log thất bại và log lượt 1 worker bị dừng trong artifact. Một lượt 1 worker với timeout harness CLI 60 giây đã PASS trước sửa chuyển tiếp. **Bản cuối đã PASS lại với timeout mặc định, 2 worker**; không đổi assertion hoặc file config để nới timeout. E2e giữ config mặc định, 2 worker.
