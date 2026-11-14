**HR-GD110 — bàn giao vòng trả lại 1, 2026-11-15**

Đã thay chân chống nâu bằng thép sơn đen có bản lề, đế, tai đạp và lò xo hồi bên trái gần gác chân. Xe đỗ nghiêng 9°, đế tiếp đất trong sai số 3 mm trên sàn chuẩn; khi lái gập sát khung. Reduced motion chốt tư thế tĩnh tương ứng. Giữ steering, axle, riderFrame và collider.

Chắn bùn có vỏ kín, mép dùng chung đỉnh; bỏ bụi hình học rời và viền crôm sáng. Atlas opaque mang dải bụi chuyển sắc, đậm ở phía dưới đuôi, có vệt bắn dọc từ bánh. Sơn enamel dùng clearcoat 1 / roughness 0,075; crôm roughness khoảng 0,075. Studio gọi trực tiếp createEnvironment của world: cùng hai RGBM KTX2 High và PMREM, dawn 0, intensity 0,3; thêm hai đèn dải để đọc highlight cong. Không dùng RoomEnvironment.

Nắp hông dựng lại bằng tiết diện cong, có gioăng/khe nối, một ốc có rãnh trên mỗi nắp và xước nhẹ. Xi-nhan có cuống crôm, vỏ đen, vành crôm, chóa và chụp amber gân nổi: đường kính chụp khoảng 31 mm, transmission 0,35, IOR 1,49. Đưa đường may yên về đúng mặt cong, hết các mũi nổi ở ảnh cận. Không chữ/huy hiệu trên nắp hông hoặc thương hiệu mới.

Danh sách file, gồm phần có sẵn trong worktree và phần hoàn thiện lượt này:

| File | Nội dung |
|---|---|
| src/features/world/vehicle/view.ts | Cài HR controller; hạ/gập chân chống, đỗ 9°, bù cao độ theo góc nghiêng |
| src/features/world/vehicle/kickstand.ts | Thép đen/lò xo/đế, một geometry/material, dùng chung Low/High, disposer hiện hữu |
| src/features/world/vehicle/hr-runtime.ts | Deferred, Low/software fallback, LOD/lifecycle; giữ group glTF nhiều vật liệu trên mỗi pivot |
| tools/assets/blender/hr-gd110.py | Geometry, ba atlas CC0, clearcoat/amber, hai LOD |
| tools/assets/blender/hr-gd110-package.mjs | Atlas 1024 chia sẻ, KTX2 UASTC + meshopt, manifest/provenance |
| public/world/vehicle/vehicle-gd110.glb | Asset cuối |
| public/world/vehicle/manifest.json | Hash, byte, texture, LOD/pivot |
| assets/LICENSES.csv | Hai dòng cho hai file public, atlas 1024 |
| tests/unit/world/hr-vehicle.test.ts | Deferred/Low/software/race, group nhiều vật liệu, LOD/pivot/disposal, giải mã asset, clearcoat/transmission/atlas |
| tests/unit/world/vehicle-view.test.ts | Tư thế đỗ, tiếp đất và khoảng hở sau khi gập |
| tools/assets/blender/hr-gd110-review.mjs | Studio PMREM world, High trước/sau bốn góc, cận mép/vật liệu, gập chân chống, LOD/Low |
| tools/assets/blender/hr-gd110-world-review.mjs | World captures và ABBA bằng Edge hardware |
| tools/assets/blender/hr-gd110-HANDOFF.md | Bàn giao này |

Không có file ngoài phạm vi card. Không sửa index.ts, mesh.ts, character, foliage, props, zones, package/lockfile, config, docs, e2e/perf specs. Không thêm dependency/tải file ngoài/lưu trạng thái. Không commit.

Log build, ảnh và ABBA ở [checks-return2](../../../test-results/hr-gd110/checks-return2/); log gate/e2e xác minh khi tiếp tục ở [checks-resume](../../../test-results/hr-gd110/checks-resume/). Lệnh gọi qua pnpm.cmd hoặc cmd /d /c để tránh PowerShell shim bị execution policy chặn.

| Lệnh | Kết quả |
|---|---|
| pnpm lint | exit 0, 0 warning |
| pnpm typecheck | exit 0 |
| pnpm test | exit 0; 192 files passed; 1988 passed, 1 skipped (1989); 79,39s |
| pnpm check:assets | exit 0; status: PASS, report-only |
| pnpm check:licenses | exit 0; RESULT: PASS, 197 public files |
| pnpm build với WASM/webpack | exit 0; Compiled successfully in 3.3s; static pages 22/22 |
| pnpm exec playwright test world --workers=2 | exit 0; 43 passed (8.4m), config mặc định, không retry |
| Edge studio/fallback/stand và world A1/B1/B2/A2/Low | exit 0, 0 page errors |

```text
Test Files  192 passed (192)
     Tests  1988 passed | 1 skipped (1989)
  Duration  79.39s

  43 passed (8.4m)
```

Build đúng một lần trong lượt trả lại này sau thay đổi code/asset cuối, dùng:

```powershell
$env:NEXT_TEST_WASM_DIR='C:/Users/PC-LP/AppData/Local/next-swc/wasm/package'
$env:NEXT_BUILD_WEBPACK='1'
pnpm.cmd build
```

Sau đó phục vụ out bằng node tools/serve-out/index.mjs out --port 4173. Toàn bộ world captures, ABBA và e2e lượt này dùng export đó. SHA-256 GLB nguồn, out và byte HTTP đều là:
`ef706ab77431a33bf61287db8341241f650ce7584764aecd0c685a5f4c8e47fc`.

Khi tiếp tục lúc 02:00 ngày 15/11, đã đọc lại code/diff và kiểm tra ảnh cận. Không đổi runtime/asset, không build thêm: code/asset cuối ghi lúc 00:18–00:19, export lúc 00:21. Đã đối chiếu lại SHA-256 public/out/HTTP/manifest trong checks-resume/build-asset-proof.json và giữ nguyên build này cho e2e. Lint đầu lượt tiếp tục bắt nhầm JavaScript trong trace Playwright của lần chạy bị ngắt (chỉ hai file trong test-results/e2e-artifacts); lượt e2e mới tự dọn outputDir. Lint cuối exit 0, 0 warning; log đầu giữ tại checks-resume/lint-initial-aborted-traces.log. Không sửa config để né lỗi.

E2e ghi đủ 43 test thành công lúc khoảng 02:09, gồm cả ba tình huống vehicle. Playwright sau đó chờ đóng web server: teardown trên Windows gọi taskkill rồi đợi tiến trình thoát, nhưng serve-out vẫn LISTENING. Đã xác minh PID 20312 là node.exe bắt đầu lúc 02:03:29, giữ cổng 4173 của chính lượt e2e này, rồi Stop-Process đúng PID đó sau khi toàn bộ test đã xong. Playwright tự in 43 passed (8.4m), exit 0. Tổng thời gian gồm cả chờ teardown; không hạ assertion, không sửa test/config, không kill tiến trình test.

Ảnh bằng Edge / RTX 3060:

| Góc | High trước (factory procedural) | High sau |
|---|---|---|
| Trước | [before](../../../test-results/hr-gd110/studio/before-high-front.png) | [after](../../../test-results/hr-gd110/studio/after-high-front.png) |
| Sau | [before](../../../test-results/hr-gd110/studio/before-high-rear.png) | [after](../../../test-results/hr-gd110/studio/after-high-rear.png) |
| Ngang | [before](../../../test-results/hr-gd110/studio/before-high-side.png) | [after](../../../test-results/hr-gd110/studio/after-high-side.png) |
| 3/4 | [before](../../../test-results/hr-gd110/studio/before-high-three-quarter.png) | [after](../../../test-results/hr-gd110/studio/after-high-three-quarter.png) |

[Cận mép chắn bùn](../../../test-results/hr-gd110/studio/after-high-close-fender.png) · [Clearcoat/nắp hông](../../../test-results/hr-gd110/studio/after-high-close-materials.png) · [Chân chống tiếp đất](../../../test-results/hr-gd110/studio/after-high-close-stand.png) · [Chân chống gập](../../../test-results/hr-gd110/studio/after-high-close-stand-folded.png).

[World đang lái High](../../../test-results/hr-gd110/world-B1/driving.png) · [Đối chứng A1](../../../test-results/hr-gd110/world-A1/driving.png) · [World Low](../../../test-results/hr-gd110/world-low/driving.png) · [Low boot mới](../../../test-results/hr-gd110/studio/fresh-low-three-quarter.png) · [SwiftShader High](../../../test-results/hr-gd110/studio/software-high-three-quarter.png).

World High bốn góc ở test-results/hr-gd110/world-B1/{front,rear,side,three-quarter}.png; cỏ che một phần ở một số góc world nên dùng studio để duyệt cận. Ảnh/JSON cũ Lead xem được giữ trong test-results/hr-gd110/return1/: đó là bản trước khi sửa, khác môi trường studio mới. So trực tiếp vòng trả lại: [ngang cũ](../../../test-results/hr-gd110/return1/studio/after-high-side.png), [3/4 cũ](../../../test-results/hr-gd110/return1/studio/after-high-three-quarter.png), [driving A1 cũ](../../../test-results/hr-gd110/return1/world-A1/driving.png). studio/before-high-* là factory procedural gốc chụp cùng PMREM/camera với bản cuối. abba-driving.json đã được tổng hợp lại từ bốn world-*/report.json cuối (bản tóm tắt trước đó còn số đo cũ).

studio/report.json xác nhận PMREM, intensity 0,3, lean 0,1570796 rad lúc đỗ; LOD0/LOD1/Low đổi đúng. studio/fallback-proof.json xác nhận page Low mới và SwiftShader High không request GLB, 0 page error. World Low chọn qua menu sau Enter World: GLB có thể đã tải lúc quality ban đầu còn Balanced; ảnh chứng minh fallback đang chạy, không dùng lượt này để chứng minh zero-fetch lúc boot Low.

| Asset | Trước vòng trả lại | Cuối lượt này |
|---|---:|---:|
| GLB | 9.937.408 B | 3.432.224 B (-65,46%) |
| Manifest | 1.288 B | 1.350 B |
| Tổng public thêm | 9.938.696 B | 3.433.574 B |
| Ba atlas chia sẻ | 2048², 8.606.143 B KTX2 | 1024², 2.056.777 B KTX2 (-76,10%) |
| LOD0 | 110.512 triangles / 4 draws | 115.680 triangles / 7 draws |
| LOD1 | 54.360 triangles / 4 draws | 57.256 triangles / 7 draws |
| Triangles lưu trong GLB | 164.872 | 172.936 |
| Vật liệu / map | 1 / 3 | 3 / 3 |

Mỗi tile chi tiết 256², có padding trong atlas 1024². Ba vật liệu và hai LOD dùng chung ba map, không nhân bản texture. Chân chống runtime thêm 1.644 triangles / 1 draw lượt chính. Factory Low vẫn 7.452 triangles / 1 draw. Studio High 26 draw/frame, Low 4, gồm sàn/shadow/transmission; khác draw lượt chính ở bảng asset. Scale 0,81; bán kính bánh 0,243m; wheelbase 1,0368m; steering pivot (0; 0,7371; 0,3483); rider seat (0; 0,8019; -0,2025).

ABBA trên export cuối: Edge hardware ANGLE / NVIDIA GeForce RTX 3060 / D3D11, 1600×900. A chặn riêng GLB xe; B dùng asset mới; tất cả High. Driving giữ W 6 giây sau mount và trả camera về gameplay. CPU là CDP page TaskDuration; draws/triangles gồm toàn world và mọi pass.

| Mẫu theo thứ tự | FPS driving | CPU page ms/s | Draw/frame | Triangles/frame | Tới playable ms |
|---|---:|---:|---:|---:|---:|
| A1 | 88,69 | 678,24 | 433,28 | 5.478.359 | 9.785,20 |
| B1 | 92,17 | 847,45 | 772,33 | 10.288.716 | 9.908,30 |
| B2 | 88,17 | 837,35 | 766,93 | 10.185.669 | 10.018,90 |
| A2 | 88,04 | 675,45 | 433,03 | 5.477.987 | 9.822,50 |

Hai mẫu asset mới vượt 60 FPS trên tuyến đo. Không diễn giải biến thiên FPS này thành tăng hiệu năng: amber transmission thêm lượt opaque scene, draws/CPU tăng rõ; đây là chi phí còn lại. Streaming/foliage/camera/tải nền thay đổi, chưa chứng nhận mọi khu trên mọi thiết bị. Low driving 94,51 FPS, khoảng 140 draw/frame.

Giới hạn còn lại: hai LOD tải chung GLB, chưa stream riêng; kính đèn pha là chóa/gân opaque, gương là PBR môi trường chứ không phản chiếu động người lái; vệt nhiệt pô là màu PBR. Tiếp đất được test trên sàn chuẩn, runtime lấy cao độ điểm neo xe như hợp đồng hiện hữu. Studio có warning Multiple active KTX2Loader khi HDRI/xe transcode đồng thời; loader được dispose khi xong, 0 page/error-console. Gate kỹ thuật không thay thế duyệt art của Lead.

Lead không cần sửa index.ts: đã dùng createVehicleView, controller tự cài trong view. Giữ kết nối tương đương 8 dòng:

```ts
import { createVehicleView } from "./vehicle/view";
const bike = createVehicleView({ surfaceHeight, reducedMotion });
scene.add(bike.group);
// Trong vòng cập nhật hiện có:
bike.update(vehicle, corridor, dt);
rider.update(vehicle, bike.riderFrame, dt, reducedMotion);
// Khi teardown:
bike.dispose();
```

Tái tạo: Blender CLI theo docstring hr-gd110.py, rồi node tools/assets/blender/hr-gd110-package.mjs. Cache CC0 tmp/gfx-p2/sand_01-diff.jpg được xác minh checksum, không tải mới. Studio: node tools/assets/blender/hr-gd110-review.mjs; world: node tools/assets/blender/hr-gd110-world-review.mjs A1|B1|B2|A2|low http://127.0.0.1:4173 tuần tự. Cận chân chống bổ sung: node tmp/hr-gd110/stand-proof.mjs; Low boot/software: node tmp/hr-gd110/low-proof.mjs sau studio. Hai script bổ sung và ảnh/log nằm trong thư mục ignored, được giữ trong worktree cho Lead xem.
