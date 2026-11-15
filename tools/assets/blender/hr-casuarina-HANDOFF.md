# HR-SHORE-TREES

Ảnh và số đo: [thư mục bằng chứng](hr-casuarina-review/). Không commit.

Ba nghiên cứu phi lao tự tạo trong Blender: cây non 8,5 m, trưởng thành 14,2 m, nghiêng gió 12,7 m. Cành gỗ chếch lên; chùm cành kim rủ xuống, xanh xám, có khoảng hở. Đây là mô hình tác giả tạo, không phải scan thực vật. Texture vỏ 2K dùng ảnh Poly Haven CC0 đã có trong cache và kiểm tra SHA-256; atlas kim 2K tự vẽ bằng Blender Python. Geometry nodes quét thân/cành. Toàn bộ phần tự tạo được hiến tặng CC0-1.0; mỗi file public có một dòng LICENSES.csv kèm URL.

Hai hàng chắn gió so le nằm phía bờ khô, đi theo đường bờ hiện hữu. Khoảng bước 8–14 m có xê dịch ngang; kiểm tra tránh nước, đường, vùng tương tác và giữ khoảng cách tối thiểu 4 m với cây khác. Lựa chọn loài từ tọa độ, có khoảng 12% keo lá tràm giữa các cây lớn; các bụi thấp giữ là keo. Không đổi terrain hoặc nội dung.

GLB meshopt và ba map KTX2 chia sẻ dùng hàng đợi tải hiện có sau khi chơi được. LOD0/LOD1 có hai primitive gỗ/kim. Impostor 2 tam giác có bốn góc bake từ chính cây đã nén; giữ camera-facing shader và hysteresis hiện có. Low dùng ba mesh tĩnh 852 tam giác/cây, không tải texture mới. Gốc cây giữ nguyên và tỷ lệ cây lớn được chuẩn hóa để giữ chiều cao thực 8–15 m.

| Biến thể | Tam giác LOD0 / LOD1 / impostor | Draw LOD0 / LOD1 / impostor | Byte GLB LOD0 / LOD1 / impostor |
|---|---:|---:|---:|
| Non | 10.040 / 4.700 / 2 | 2 / 2 / 1 | 124.196 / 64.848 / 807.944 |
| Trưởng thành | 12.904 / 6.004 / 2 | 2 / 2 / 1 | 159.636 / 81.820 / 610.072 |
| Nghiêng gió | 12.904 / 6.004 / 2 | 2 / 2 / 1 | 160.936 / 82.440 / 710.896 |

Asset public mới: **12.004.627 byte**, gồm ba KTX2 chia sẻ; không tính lặp texture trong từng LOD. Manifest thêm **12.863 byte**; tổng public tăng **12.017.490 byte**. Byte tải ở thời điểm bắt đầu chơi và CPU/FPS thực tế được ghi riêng trong báo cáo runtime.

Các file thay đổi:

- `public/world/lib/hr-tree-casuarina-*`: 9 GLB và 3 KTX2; manifest chỉ thêm ba entry.
- `assets/LICENSES.csv`: 12 dòng cho asset mới.
- `src/features/world/foliage/{coast-r1,hr-coastal,hr-library,hr-runtime,hr-variation,scatter}.ts`: silhouette Low, chọn loài, tải/cache, tỷ lệ và hàng chắn gió.
- `tools/assets/blender/hr-casuarina{.py,-package.mjs,-bake.mjs,-stage.mjs,-world-review.mjs,-report.mjs}`: tái tạo asset, bake, chụp và kiểm tra bằng chứng.
- `tests/unit/world/{hr-casuarina,hr-tree-runtime,hr-tree-manifest,coast-r1,foliage,foliage-canopy,foliage-natural}.test.ts`: asset, clearance, ownership, tỷ lệ, LOD2 và lifecycle Low.
- Bằng chứng sinh ra ở `tools/assets/blender/hr-casuarina-review/`. Cache và bản sao build ở `tools/styleframes/.vite/test-results/hr-casuarina/`: ngoài danh sách file nguồn của ticket, cần để tránh ACL thư mục generated cũ; không sửa cấu hình, dependency hoặc quyền hệ thống.

Test cũ yêu cầu tán ven biển tối/đặc và không có hàng cây trên toàn vùng. Giữ nguyên các assertion đó cho cây tự mọc ngoài hàng chắn gió mới; kiểm tra riêng màu, hình học, khoảng cách và ổn định tile của phi lao. Giữ các phép đo budget; ADR 0019 cho phép tăng độ chi tiết Low từ fallback cũ 280 tam giác lên 852 tam giác.

Build duy nhất dùng WASM SWC + webpack trong bản sao nguồn có hash kiểm chứng. Export cuối nằm ở `tools/styleframes/.vite/test-results/hr-casuarina/build-workspace/out/`; `out/` gốc vẫn là baseline. E2E dùng config Playwright mặc định, Edge SwiftShader, `world --workers=2`, từ cwd của bản sao. Đo hình/FPS dùng Edge có cửa sổ và RTX 3060 thật 1600×900; không dùng số SwiftShader để nhận FPS High.

Kết quả lệnh cuối (log trong thư mục bằng chứng):

```text
pnpm lint: exit 0, 0 warning
pnpm typecheck: exit 0
pnpm test --configLoader runner --no-cache --maxWorkers=2 --testTimeout=60000:
  Test Files 199 passed (199)
  Tests 2031 passed | 1 skipped (2032)
  exit 0
pnpm check:assets: status PASS, errors []
pnpm check:licenses: RESULT: PASS
NEXT_TEST_WASM_DIR=<cache WASM theo card> NEXT_BUILD_WEBPACK=1 pnpm build:
  exit 0, đúng một lần; Build ID VbZqRdT_p_sOX4wJkYz5C
E2E_PORT=4202 pnpm --config.verifyDepsBeforeRun=false exec playwright test world --workers=2:
  43 passed (4.7m), exit 0
```

Vitest dùng loader `runner`/tắt cache và `BUDGET_REPORT_DIR` mới để tránh ghi vào thư mục generated cũ; không thay config. Phiên tiếp tục giữ nguyên build duy nhất từ lượt trước: `build-proof.json` xác nhận SHA-256 của 278 file runtime/config và manifest cùng 12 asset mới khớp export. Không có thay đổi runtime/asset sau build; các chỉnh sửa bàn giao và artifact kiểm chứng không yêu cầu build lại.

Lượt unit của phiên tiếp tục: 199 file, 2031 passed / 1 skipped, exit 0, 220,94 s (`test-resume.log`). Lint, typecheck, assets và licenses cũng chạy lại, đều exit 0; lint không có warning. Windows dùng `pnpm.cmd` để tránh execution policy của PowerShell, không đổi policy. Khi chạy e2e từ bản sao, thêm `<worktree>/node_modules/.bin` vào PATH để dùng executable hiện có; không cài dependency. Static server được mở riêng trên cổng 4202, phục vụ export đã xác minh, để Playwright tái dùng đúng server của slot B.

Lượt e2e đầu của phiên tiếp tục có 42 passed / 1 failed: test journal timeout 90 s khi chờ nút Enter World hết disabled tại Welcome, trước khi vào world. Log giữ ở `e2e-resume-first.log`; trace và page snapshot ở `test-results/e2e-first-failure/`. Chưa xác định nguyên nhân của lần timeout này. Không đổi source, config, timeout hoặc assertion khi chạy lại toàn bộ suite trên cùng build.

Lượt e2e cuối: **43 passed (4.7m), exit 0**, 2 workers, `E2E_PORT=4202`, không retry trong lượt chạy. Test journal pass trong 7,9 s. [verification-resume.json](hr-casuarina-review/verification-resume.json) ghi exit 0 của cả sáu kiểm tra và cả hai lượt e2e; [report.json](hr-casuarina-review/report.json) ghi toàn bộ gate kỹ thuật PASS. `test-final.log`, `e2e.log`, `assets.log` đã được cập nhật từ log phiên tiếp tục; bản cũ giữ với hậu tố `-previous.log`.

| Khu / quality | FPS RTX 3060 | Draw toàn frame | Tam giác toàn frame | CPU ms/s |
|---|---:|---:|---:|---:|
| Quiet Shore High | 100,27 | 212 | 4.946.626 | 495,96 |
| Last Postcard High | 100,00 | 115 | 3.573.652 | 468,88 |
| Quiet Shore Low | 94,02 | 89 | 291.977 | 400,66 |
| Last Postcard Low | 94,67 | 45 | 208.111 | 344,43 |

CPU ABBA đã hoàn tất khi tiếp tục ticket, chạy tuần tự trên RTX 3060 trước unit/e2e:

| Khu | CPU A trước (ms/s) | CPU B sau (ms/s) | Chênh lệch |
|---|---:|---:|---:|
| Quiet Shore | 316,96 | 315,77 | −0,38% |
| Last Postcard | 299,71 | 291,49 | −2,74% |

Mỗi cột là trung bình hai lượt source với cùng camera/quality; các mức chênh nhỏ này chỉ là quan sát local, không phải bằng chứng tăng tốc có ý nghĩa thống kê. Các mẫu B đạt 100,02–100,13 FPS. Không trộn số CPU source ABBA với lượt production trong bảng trên.

Đây là số draw/triangle gửi qua WebGL trên toàn frame, gồm shadow/post; không phải số geometry lưu của riêng phi lao. CPU dùng CDP TaskDuration trên cửa sổ 5 giây sau warmup. Canvas 1600×900, focus/visibility hợp lệ. Lượt production High không chạy đồng thời với build/unit/e2e trong phiên này. Chơi được sau **13.175,8 ms** kể từ click Enter World; phi lao đầu tiên bắt đầu request ở **64.834,5 ms** từ navigation, sau mốc chơi được **13.389,5 ms** từ navigation. Byte phi lao trước chơi được: **0**. Đây là một lượt local, không phải chỉ số mạng chuẩn hóa.

Ảnh: [Quiet Shore trước/sau](hr-casuarina-review/compare-quiet-shore-high.png), [Last Postcard trước/sau](hr-casuarina-review/compare-last-postcard-high.png), [cận vỏ](hr-casuarina-review/bark-close.png), [cận chùm kim](hr-casuarina-review/crown-close.png), [Low Quiet Shore](hr-casuarina-review/low/quiet-shore.png). Cặp High dùng đúng cùng pose, không crop lại camera. Before dùng source HEAD qua Vite; after dùng export production. UI và các đối tượng chuyển động khác thời điểm chụp. Atlas impostor được chụp bằng renderer dùng chung; không có pixel tham chiếu hoặc ảnh AI.

Tái tạo asset: chạy Blender CLI với `hr-casuarina.py`, rồi `node .../hr-casuarina-package.mjs`, `node .../hr-casuarina-bake.mjs`. Review production: phục vụ export cuối ở port 4215, chạy `node tools/assets/blender/hr-casuarina-world-review.mjs after --production` và `low --production`. ABBA source tuần tự: `before-abba1`, `after-abba1`, `after-abba2`, `before-abba2`; A dùng source HEAD qua Vite transform chỉ trong review, B dùng source hiện tại. Không sửa file runtime để đổi A/B. `node tools/assets/blender/hr-casuarina-report.mjs` kiểm hash/camera/asset/build ID và sinh ảnh ghép cùng báo cáo.

Không cần nối thêm vào `index.ts`: đường `compose.ts → createCoastR1Trees → bindHrForest` đã có. Nếu Lead dùng lifecycle hiện hữu, ví dụ độc lập dưới đây dưới 15 dòng:

```ts
import { createCoastR1Trees } from "./foliage/coast-r1";
const coast = createCoastR1Trees(coastTrees);
scene.add(coast.group);
coast.setQuality(quality);
coast.fade(camera.position, playerPosition, dt);
// Khi dỡ tile:
coast.dispose();
```

Giới hạn: Low là biểu diễn hình học rẻ; impostor xa có ánh sáng bake. Keo lá tràm dùng implementation hiện hữu. Ảnh kiểm tra kỹ thuật không tự chứng minh đạt thước đo photoreal; Lead cần duyệt ảnh tổng và cận cảnh. Các kết quả định lượng cuối ghi ở `hr-casuarina-review/report.json`.
