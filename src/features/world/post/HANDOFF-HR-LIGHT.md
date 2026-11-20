# HR-LIGHT — bàn giao vòng 2, 14/11/2026

Tiếp tục phần việc có sẵn sau Lead rebase lên `496571e` (có HR-ROOTS-SIGN). Không commit. Không sửa index.ts, cây, package/lockfile, config, docs, tests/e2e hay tests/perf.

## File và thay đổi

- `src/features/world/post/canopy-rays.ts` (mới): 35 ribbon additive theo hướng nắng thật tại các khe tán, thêm 770 hạt bụi GPU. Hai draw cho toàn bộ cụm; depth test bật, không ghi depth/không cast shadow; feather/noise, fade gần/xa; High/balanced (legacy), reduced motion dừng clock. Không phụ thuộc mặt trời trong khung hình.
- `src/features/world/foliage/ground-litter.ts` (tiếp tục file mới): bốn batch instanced cho lá cong nhiều màu nâu/vàng, cỏ bảy lá cong khác chiều cao, rễ nổi và đá vụn. Mở biome đồi, tăng mật độ ở vùng sáng, chuyển mật độ quanh pad liên tục, chừa tim đường/suối/cầu. Rễ đọc transform gốc cây có sẵn; không sửa cây. Lambert nhận shadow, giảm chi phí so với Standard cũ. Điền từ gần ra xa, tối đa 80 ô hoặc khoảng 0.6 ms/frame; chỉ upload range mới, đứng yên không scatter/upload. Fade 32 m High / 22 m balanced (legacy).
- `src/features/world/post/aerial.ts` (tiếp tục file mới): tích phân mật độ sương theo độ cao, tăng phân lớp xa và ngả xanh xám; 8/4 tap, bỏ hoàn toàn gather khi mặt trời ngoài khung hình.
- `src/features/world/post/cinematic.ts`: gộp aerial vào pass grading đang có, bỏ một pass HDR toàn màn hình của vòng 1; chia sẻ đúng depth/uniform, giữ AO mềm 0.50/0.34. Không đổi resolution/sample/shadow của PERF-HR.
- `src/features/world/post/runtime.ts`: nối deferred floor/rays, theo quality/scene/dispose. Công tắc A/B chỉ trong QA journey đã opt-in: `document.dispatchEvent(new CustomEvent('tqa:light-review', { detail: false }))`, `true` để bật lại. Chỉ trong bộ nhớ, không UI/URL/storage. Giúp giữ cây/bảng Roots sau rebase giống nhau giữa hai phía.
- `tests/unit/world/hr-light.test.ts`: tích phân độc lập, sun projection/depth identity, hình học finite, hill population, đứng yên không upload, nguồn nắng ngoài khung hình, reduced motion/Low/dispose.
- `tests/unit/world/post-c.test.ts`: deferred/quality lifecycle, depth chung của aerial/AO/DOF, opt-in A/B và dọn listener.
- `tests/review/hr-light.mjs`: ảnh gameplay và pose cố định bổ sung First Light forest/Roots sun/Horizon slope; native Edge, GPU, draw/triangle, CPU/FPS, timing; tùy chọn `--profile` ghi Roots ABBA cùng session và cpuprofile.
- `tests/review/hr-light-report.mjs`: bảng và ảnh trước/sau vòng 2 riêng, giữ bằng chứng vòng 1.
- `src/features/world/post/HANDOFF-HR-LIGHT.md`: file này.

Tất cả file code trong phạm vi ticket; không có file code ngoài phạm vi. Hình học tự tạo bằng code, public asset +0 byte, không dependency mới.

## Gate và build

```text
pnpm.cmd lint                  LINT_EXIT=0; 0 errors, 0 warnings
pnpm.cmd typecheck             TYPECHECK_EXIT=0
pnpm.cmd test --maxWorkers=2   Test Files 186 passed (186)
                              Tests 1950 passed | 1 skipped (1951); TEST_EXIT=0
WASM webpack build            BUILD_EXIT=0
world e2e                     43 passed (7.1m); E2E_EXIT=0
```

PowerShell chặn pnpm.ps1 nên dùng pnpm.cmd. Lượt unit mặc định đầu có ba timeout 15 s (asset CLI, secrets wiring, First Light terrain) trong lúc máy tải cao; đã chạy lại **toàn bộ** suite với hai worker, không sửa timeout/config và không bỏ test. Log fail được giữ ở `tmp/hr-light/r2-test.log`, log PASS ở `r2-test-final.log`; lint/typecheck/build cũng có tiền tố `r2-` trong thư mục này.

Đúng một lần `pnpm.cmd build`, sau thay đổi code cuối, với `NEXT_TEST_WASM_DIR=C:\Users\PC-LP\AppData\Local\next-swc\wasm\package`, `NEXT_BUILD_WEBPACK=1`. Build ID `NcICu-wLYmeGXifLB8tLO`. SHA256 nguồn trước build: `tmp/hr-light/r2-source-sha256.json`.

## Ảnh, FPS và hồi quy CPU

Ảnh trước/sau và bảng đầy đủ: [r2-index.html](../../../../test-results/hr-light/r2-index.html), [r2-metrics.md](../../../../test-results/hr-light/r2-metrics.md), [r2-summary.json](../../../../test-results/hr-light/r2-summary.json). Vòng 1 được giữ nguyên ở index.html/summary.json cũ.

Native Edge, RTX 3060 (ANGLE D3D11), 1600×900 DPR1, High khóa bằng menu; A1 off → B1 on → B2 on → A2 off, rồi Low. Không chạy build/unit/e2e đồng thời với phép đo. Mỗi điểm lấy mẫu 5 s sau khi làm ấm 10 s. FPS đếm frame có draw; draw/triangle gồm cả shadow/post. CPU là CDP TaskDuration chia thời gian thực, không phải GPU time hay số chu kỳ CPU.

**Before là ablation trên cùng build cuối**, tắt floor/rays/aerial và trả AO về 0.42/0.28. Cây/bảng Roots sau rebase giống nhau. Không giả danh đây là checkout commit cũ. Ảnh First Light rays chụp bổ sung một cặp off/on trong cùng session ở đúng pose đã ghi trong harness; không dùng session bổ sung này làm FPS. Các góc còn lại dùng A2/B2. Pose forest cho thấy lá/rễ, rays cho thấy ánh sáng, slope cho thấy cỏ và xa cảnh; Low có ảnh riêng.

| Quality / mode | Triangle/frame | Draw/frame | CPU task ms/s | FPS |
| --- | ---: | ---: | ---: | ---: |
| High first-light / off | 6,345,445 | 397 | 610.6–910.2 | 79.5–100 |
| High first-light / on | 7,027,559–7,200,597 | 403–415 | 453.6–707.4 | 72.1–98 |
| High roots / off | 4,546,978 | 351 | 551.1–914.2 | 62.7–100 |
| High roots / on | 5,294,160 | 355–356 | 529.7–532.7 | 93.4–99.2 |
| High horizon / off | 1,346,775–1,398,361 | 198 | 315.1–702.5 | 78.8–100 |
| High horizon / on | 1,791,881 | 200 | 304.3–354.1 | 100 |
| Low First Light | 365,290 | 137 | 337.8 | 100 |

Hai lượt High on ở ba khu đều trên 60 FPS (thấp nhất **72.1 FPS**); diagnostic Roots có on thấp nhất **66.6 FPS**. Lượt A1 tải máy cao ngay cả khi off (Roots 914.2 ms/s / 62.7 FPS); không được suy từ đó rằng HR-LIGHT làm nhanh hơn. First Light/Horizon có biến thiên mesh deferred giữa lượt; giữ khoảng thay vì gán toàn bộ delta cho nền mới.

JS export vòng 1 6,762,564 → 6,777,006 byte (**+14,442 byte** chưa nén); delta bao gồm rebase, không phải riêng HR-LIGHT. A/B dùng cùng JS bytes. Public asset +0 byte, không request texture/GLB mới do ticket. Interactive 5.3–9.3 s; dressing-ready 10.5–22.6 s (High). A/B chỉ tắt hiệu ứng sau entry nên các mốc startup mô tả build đang có, không phải phép so startup bật/tắt. Dressing-ready không phải thời điểm chơi được.

### Hồi quy Roots

- Đọc code vòng 1: bộ điền nền đã dừng sau khi đủ ô, nên không có bằng chứng cho giả thuyết scatter lại toàn bộ mỗi frame đứng yên. Điểm thừa rõ ràng là một pass HDR riêng và 16 depth gather vẫn chạy khi sunVisibility bằng 0; khi chuyển ô còn upload cả capacity buffer sau mỗi lô.
- Đã bỏ pass riêng, branch sớm trước gather (8/4 tap khi cần), dùng Lambert thay Standard cho nền, upload chỉ range mới và giữ instancing bốn batch. Unit kiểm tra phiên bản buffer không tăng sau khi điền xong, có tăng lại khi chuyển ô.
- Production Roots on **529.7–532.7 ms/s**, giảm khoảng **26% so mốc 718 ms/s** được báo vòng trước. So lịch sử có rebase/tải máy khác nên đây là cải thiện quan sát, không chứng minh toàn bộ 199 ms/s cũ có một nguyên nhân duy nhất.
- Profile 3 s off/on tại cùng Roots: getVertexPosition (đường raycast mesh) vẫn là self JS lớn nhất, 215.9 / 155.2 ms; intersection, updateMatrixWorld và render submission cũng hiện cả hai phía. Dev profile có nguồn cho thấy updateCamera inclusive 363 / 438 ms trên cửa sổ 3 s; floor không có sample đáng kể khi đã đứng yên. Camera/LoS không lấy floor mới làm collider; không sửa camera, index hay ticket khác.

| Roots cùng session | CPU task ms/s | FPS |
| --- | ---: | ---: |
| A1 off | 669.1 | 99.8 |
| B1 on | 617.3 | 96.8 |
| B2 on | 369.8 | 66.6 |
| A2 off | 378.6 | 68.1 |

Raw profile production: r2-after-2/roots-{off,on}.cpuprofile; dev có tên nguồn: round2-profile-dev/roots-{off,on}.cpuprofile trong cùng thư mục kết quả. A/B cùng session không tái hiện mức tăng 199 ms/s. Các cửa sổ vẫn chịu tải/scheduling và nhịp frame thay đổi; không tuyên bố CPU miễn phí/nhanh hơn hoặc benchmark T08/T09 cô lập.

World e2e: E2E_PORT=4207 pnpm.cmd exec playwright test world --workers=2, config/browser mặc định; server riêng node tools/serve-out/index.mjs out --port 4207 trỏ đúng W-A/out. **43/43 PASS, exit 0**, không skip, không can thiệp teardown. Log tmp/hr-light/r2-e2e-world.log. Nguồn 5/5 file SHA256 vẫn khớp sau e2e và ABBA. Lint chạy lại sau khi bổ sung pose trong harness: r2-lint-delivery.log, exit 0, 0 warning.

## Giới hạn

- Ribbon là thể tích giả, có occlusion theo depth của cảnh, không tích phân ánh sáng từ shadow map. Chỉ đặt ở các khe tán đã chọn; không phải mô phỏng thể tích toàn rừng. Vẫn có screen-space rays bổ sung khi thấy khe trời.
- Sương chiều cao dùng mốc thế giới 5 m; không bám riêng từng lòng suối. Native fog cũ vẫn giữ vai trò nền xa.
- Nền là near field có cap instance; chuyển ô 8 m/teleport điền dần qua nhiều frame. Không có double buffer giữ toàn bộ nền cũ; cỏ ưu tiên khoảng sáng theo trường không gian cố định, không đọc shadow map. Mặt phẳng tiếp tuyến cục bộ có thể lệch vài cm tại mép tam giác terrain.
- Các cây/props/terrain/mây hiện hữu còn silhouette và mảng phẳng. Có khác biệt hình ảnh rõ, nhưng không tuyên bố toàn cảnh đã đạt tiêu chí khó phân biệt ảnh chụp thật.

## Lead nối index.ts

Đã nối qua runtime hiện hữu; Lead không cần sửa index.ts. Giữ API đang gọi (7 dòng):

```ts
const paper = createGradedPaperPass(renderer, quality);
paper.setGrade(grade);
paper.startDeferred(scene);
paper.setMotion(moving, delta, focusDistance);
paper.render(scene, camera);
paper.setQuality(nextQuality);
paper.dispose();
```
