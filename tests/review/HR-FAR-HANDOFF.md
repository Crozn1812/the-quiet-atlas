# HR-FAR-B — W-D, tiếp tục diff HR-FAR hiện có

[Gallery trước/sau](../../test-results/hr-far/b.html) · [Bảng số đo](../../test-results/hr-far/b-report.md) · [Build/hash](../../test-results/hr-far/b-build.json) · [Bàn giao vòng 2 giữ nguyên](../../test-results/hr-far/round2-handoff-preserved.md)

**Gate và điều kiện FPS HR-FAR-B: PASS.** [Gallery cuối: bốn góc far + tele 20° cạnh ảnh vòng 2 + Low](http://127.0.0.1:4380/b.html). Cả bốn góc thường/far đều ≥60 trên RTX 3060, 1600×900 DPR 1; thấp nhất **98,68 FPS**. Dùng nguyên cohort `b-production-final` trên build duy nhất `TnZcGGvGi2aJT5vkXv6nW`, không chọn mẫu tốt nhất từng góc. Không commit. Art vẫn cần Lead đối chiếu ảnh; không suy rằng toàn cảnh đã đạt chuẩn ảnh chụp thật.

## Bốn điểm HR-FAR-B

1. **Bạc trắng:** màu xanh đậm lớp gần, extinction theo khoảng cách thực; lam/xám dần ở lớp xa, sương dưới chân/khe. Backdrop xử lý sương riêng. Chẩn đoán phát hiện depth biển trong suốt gây đường ngang qua chân núi: far vẽ sau biển, kiểm tra depth copy và chỉ pixel nền nhìn thấy ghi depth trời, tránh aerial lần hai. Không sửa biển/post/sky.
2. **Đốm tròn:** tán liên tục bằng domain warp và các tần số xoay khác nhau: mảng rừng lớn, bóng tán vừa, nhiễu nhỏ; không Gaussian/Voronoi/crown radial. Đá xám theo dốc và noise địa chất. Dùng normal relief theo footprint để chiếu sáng tán, bỏ hai lần lấy mẫu lại toàn trường noise.
3. **Kim/lơ lửng:** giữ bộ kẹp dốc đã có khi nhận: cạnh ≤1,4 m/m, gradient tam giác ≤1,98, góc ≥26,8° so với phương thẳng đứng. High far plane 2400 m bao trọn mesh và chân cả bốn dãy; thêm test trên tam giác thực và bounding box từ bốn zone. Không viết lại sống núi/vai lệch/khe; hash far-relief.ts và far-forest.ts trùng bản lúc nhận.
4. **FPS:** giữ lưới High 8 m / 131.072 tam giác, giảm 75% so với vòng 2; Low 16 m / 32.768; một draw nền. Đo native cả pose thường và far, không dùng tele đo FPS. Cả bốn góc PASS như bảng dưới.

Ba FIX-PATCH (Workshop/Roots/Milestones), crown seat, deferred/Low/lease/disposal giữ nguyên. Không sửa index, terrain, foliage, props, sky, vehicle, post, zones dressing, content, docs, config, package/lockfile, e2e/perf spec. Không dependency, tải file ngoài, public asset mới hoặc trạng thái lưu bền; không cần thay LICENSES.csv.

## File bàn giao (19, gồm diff kế thừa)

| File | Vai trò |
|---|---|
| `src/features/world/scene/far-landscape.ts` | Mesh/quality, thứ tự sau biển/trước surf và rays, depth preparation/lifecycle |
| `src/features/world/scene/far-material.ts` | Tán nhiều tần số, đá, nắng/haze, depth copy riêng backdrop |
| `src/features/world/scene/far-relief.ts` | Bốn dãy + kẹp dốc kế thừa, không đổi từ lúc nhận |
| `src/features/world/scene/far-shadows.ts` | Horizon bake kế thừa |
| `src/features/world/scene/far-forest.ts` | HR-TREE1 groves kế thừa, không đổi từ lúc nhận |
| `tests/unit/world/far-landscape.test.ts` | Giữ FIX-PATCH; thêm dốc thật/frustum và queue của hai tier |
| `tests/unit/world/far-material.test.ts` | Mới: Low/startup không cấp buffer, reuse/resize/dispose, restore target khi copy lỗi |
| `tests/unit/world/far-relief.test.ts` | Ridge/kẹp dốc/shadow kế thừa |
| `tests/unit/world/far-forest.test.ts` | Deferred/Low/lease/disposal kế thừa |
| `tests/unit/world/far-raycast.ts` | Broad phase fixture kế thừa, giữ tam giác/vertex IDs |
| `tests/unit/world/cinematic-polish.test.ts` | Dùng fixture kế thừa, giữ rays/assertions |
| `tests/review/hr-far.mjs` | Pose cohort, native FPS/CPU/draw/triangle; thêm tele từng góc, chẩn đoán sea/sky/mist |
| `tests/review/hr-far-ingame.mjs` | Công cụ ingame-shots có sẵn; chọn baseline/output B qua env |
| `tests/review/hr-far-b-report.mjs` | Mới: seal/verify build, assert pose/state/ảnh, report/gallery B |
| `tests/review/hr-far-cpu.mjs` | CPU factory ABBA kế thừa |
| `tests/review/hr-far-crowns.mjs` | Review crowns lịch sử, không chạy lại B |
| `tests/review/hr-far-report.mjs` | Report vòng 1 lịch sử, không chạy lại B |
| `tests/review/hr-far-round2-report.mjs` | Report vòng 2 lịch sử, không chạy lại B |
| `tests/review/HR-FAR-HANDOFF.md` | Bàn giao này |

B trực tiếp chạm 8 file: far-landscape, far-material, far-landscape.test, far-material.test, hr-far.mjs, hr-far-ingame.mjs, hr-far-b-report.mjs và bàn giao. Còn lại giữ diff account trước. Không có file ngoài phạm vi; bằng chứng sinh ở test-results/hr-far/ và tmp/.

## Gate và lệnh

```text
pnpm lint: exit 0, 0 warning
pnpm typecheck: exit 0
VITEST_MAX_WORKERS=1 pnpm test: exit 0
  Test Files 197 passed (197)
       Tests 2011 passed | 1 skipped (2012)
    Duration 462.97s
NEXT_TEST_WASM_DIR=... NEXT_BUILD_WEBPACK=1 pnpm build: exit 0
  Build duy nhất: TnZcGGvGi2aJT5vkXv6nW
  HTTP SHA-256 + 5 runtime hashes/mtimes match
E2E_PORT=4379 pnpm exec playwright test world --workers=2: exit 0
  43 passed (5.6m)
INGAME_HIGH: exit 0; 8 matched captures / 45 s warmup, zero page/shader errors
INGAME_LOW: exit 0; 1 matched capture, zero page/shader errors
PRODUCTION_LOW: exit 0; glBeforeTele=0, glError=0
PRODUCTION_HIGH_FINAL: exit 0; 4 zones, native normal+far 10 s/window, all >=60
  Zero page/shader/HTTP errors; WebGL before/after tele = 0 at all zones
REPORT: exit 0; 4 matched far + 4 tele20 + farthest tele + Low; FPS PASS
```

Log gate: `tmp/hr-far-b-{lint-final,typecheck-final,test-final,build,e2e}.log`. Lint/typecheck/unit trên runtime chốt trước build. Không sửa runtime sau build; report kiểm tra lại hash/mtime.

| High / RTX 3060 / 1600×900 DPR 1 | round2-confirm thường / far | B cuối thường / far |
|---|---:|---:|
| Workshop | 67,49 / 95,99 | **99,99 / 100,04** |
| Old Trail | 74,40 / 85,60 | **100,06 / 100,17** |
| Horizon | 68,16 / 84,35 | **99,98 / 100,16** |
| Milestones | 52,53 / 66,42 | **98,68 / 100,08** |

Raw cuối: `b-production-final/metrics.json`; log `tmp/hr-far-b-production-final.log`. Gallery/bảng được tạo bởi `HR_FAR_FINAL=b-production-final node tests/review/hr-far-b-report.mjs report`, assert đúng pose, focus/visibility/pause/context, GL 0, PNG 1600×900 và hash runtime/BUILD_ID. Ảnh ingame-shots 8 High + 1 Low ở `b-ingame-{high,low}/`; High warmup 45 s. `controlsReadyMs` và `worldReadyMs`, số draw/tam giác/CPU, byte và ABBA đầy đủ trong bảng số đo.

Gallery HTTP 200 và đủ 20 ảnh HTTP 200; bằng chứng `b-gallery-http.json`. `git diff --check` PASS. Trang build giữ ở http://127.0.0.1:4379/en/; gallery ở http://127.0.0.1:4380/b.html.

## Đo và giới hạn

- Public asset thêm **0 byte**. Mesh attribute/index buffer **5.136.432 byte**, từ **20.496.432** vòng 2. Low dùng chung buffer; không giải phóng VRAM khi đổi tier.
- High/Balanced có post, backdrop hiện: **1 GPU depth blit/frame**, không readback/redraw cảnh. Copy buffer 1600×900 ước tính **11.520.000 byte** (RGBA8 chưa dùng + depth32). Deferred; Low/direct/startup/First Light che kín không cấp/copy. High→Low giữ tới dispose; test resize/reuse/release. Draw counter không đếm blit, nên ghi riêng.
- 520 cụm lá / 3 instanced draws / 2.462.124 tam giác giữ vòng trước; không tăng mạng/asset. Cold Low không acquire module được unit kiểm tra. Ảnh Low đổi quality sau Enter World, không phải đo cold-cache network.
- CPU factory ABBA mới: A1 584,76 / B1 1000,04 / B2 978,67 / A2 540,50 ms. **A là HEAD trước HR-FAR, không phải vòng 2**; Node B chưa gồm GPU/decode/network. Browser ABBA chỉ bỏ draw; depth blit còn ở A/B, không cô lập toàn module.
- Raw round2-confirm sao chép nguyên từ W-A. Tele mỗi góc bổ sung từ export vòng 2 còn nguyên (BUILD_ID INodeci6fiqg6TxKmJJe8, HTML SHA-256 đã đối chiếu); không tái tạo ảnh cũ bằng shader mới. Export W-A HEAD 3a82f2e, W-D HEAD ee742e6; tổng cảnh có khác biệt đã có trước khi nhận. Không quy chênh lệch tổng FPS/triangle thành speedup riêng far.
- Vòng 2 ghi Milestones 52,53 FPS; đo lại cùng export hiện tại 91,20. Giữ cả hai bảng. Source preflight B riêng Milestones 83,57 thường / 100,16 far chỉ là kiểm tra trước build; bảng cuối phía trên dùng export. Preview lúc unit chạy có 57,71 FPS observer, giữ raw b-seal-preview; không dùng làm native gate, không bỏ mẫu thấp.
- Native FPS = rAF cadence 10 s khi tháo interception WebGL; kiểm tra focus/visibility/pause/context loss. Draw/triangle từ observer trước đó; CPU CDP ms/s, không phải GPU timestamp. Màn hình giới hạn cadence, máy dùng chung; không cam kết speedup có kiểm soát.
- Camera/tele cố định; gió/mây/animation không khóa nên pixel động khác nhau. Low giữ đường rẻ. Art cần Lead đối chiếu gallery; không suy từ gate kỹ thuật rằng toàn cảnh đạt chuẩn ảnh chụp thật.
- Typecheck đầu bị bản sao .ts trong tmp của tôi; đổi sang .ts.txt, không sửa config. Typecheck cuối/full unit PASS. Preview Vite không làm gate build/e2e; giữ log chẩn đoán.
- Lượt export đầu `b-production` dừng sau Workshop: native 57,62 thường / 54,77 far; tool tele gọi lại program GL đã dispose nên kiểm tra getError báo 1282. Đã sửa riêng review tool để bỏ program đã xóa và kiểm tra GL trước/sau tele, không sửa runtime/build. Có Edge GPU khác PID 26424 vẫn chạy sau khi browser của lượt này đóng; các lượt PID 26916/22908 tiếp nối. Giữ nguyên log/ảnh, snapshot tải ở `b-gpu-load-initial.json` / `b-gpu-before-confirm.json`. Lượt `b-production-confirm` dừng trước khi lấy mẫu vì GPU cạnh tranh 62,74%; không coi là PASS. `b-visual-confirm` đủ bốn góc/tele GL 0 chỉ xác nhận hình. Chờ GPU rảnh rồi đo nguyên cohort cuối, snapshot trước lượt cuối `b-gpu-before-final.json` không có Edge 3D khác; không trộn các lượt.

## Lead nối index.ts

API giữ nguyên; không cần nối thêm. Depth lifecycle nằm trong module far. Ví dụ (không áp vào index):

```ts
const farLandscape = createFarLandscape({ deferred: true });
scene.add(farLandscape.mesh);
dressing.defer(farLandscape.build);
// Teardown hiện có:
farLandscape.dispose();
```

