# HR-PROPS — bàn giao W-C

Đã triển khai kho asset và thay **dressing được chọn** của sáu khu. **Chưa đủ điều kiện đóng toàn ticket**: foliage toàn cục và một số đá/gỗ thuộc cấu trúc tương tác vẫn dùng hệ cũ; yêu cầu không còn mọi vật low-poly ở High chưa được xác lập. Không sửa `foliage/**`, `zones/roots*.ts`, `post/**`, `index.ts`, content, dependency, config hay e2e/perf spec. Không commit.

19 asset Blender CC0 mới: bốn bụi (`broadleaf`, `needle`, `wildflower`, `bamboo`), ba fern (`arching`, `sword`, `round`), sáu đá (`boulder`, `river`, `slate`, `moss-boulder`, `moss-river`, `moss-slate`), hai gỗ mục (`fungi`, `moss`), ba cọ (`coconut`, `leaning`, `shore`) và một cụm `grass-meadow`. Mỗi asset có LOD0/LOD1, meshopt; 38 GLB dùng ba atlas KTX2 2048, tổng **13.476.824 byte**. Manifest thêm 65.441 byte; tổng tăng public 13.542.265 byte. Bốn cây đồi tái dùng `hr-tree-{spreading-crown,umbrella-crown,slender-upright,leaning-riverside}` của HR-TREE1.

Nguồn ảnh: cache Poly Haven `forest_floor`, `pine_bark`, `river_small_rocks`, kiểm SHA-256 từ `tools/assets/textures/cc0-sources.json`. Không download hoặc dùng pixel tham chiếu art/AI. Hình học tự tạo trong Blender CLI. Mỗi file public mới có đúng một dòng license/URL; generator chạy lại được, chỉ thay các mục do nó sở hữu. Atlas 2048 gồm bốn ô 1024; lá dùng grain ảnh được nhuộm lại và gân tự tạo, không phải tuyên bố lá scan thực vật. Ảnh xem asset: [LOD0](../../../test-results/hr-props/assets/lod0.png), [LOD1](../../../test-results/hr-props/assets/lod1.png), [validation](../../../test-results/hr-props/assets/validation.json).

Runtime giữ PBR base-color/normal/roughness, smooth normals và primitive riêng. Instancing theo asset/LOD/primitive; LOD có hysteresis 26/21 m; chỉ LOD0 gần 22 m được cast shadow; cull xa. Nạp sau paint đã playable, intro done, không pause; Low dùng nguyên geometry fallback, không khởi tạo request mới khi bắt đầu ở Low. Một batch chỉ đổi sau khi toàn bộ asset của nó sẵn sàng; lỗi giữ toàn bộ fallback, có cleanup late arrival và dispose idempotent. Bounds fit hợp cả hai LOD để giữ footprint. High tree/palm mới kiểm tra toàn tán trên cả hai vai đường; không đổi collider, anchor hoặc lối E. Source smoke xác nhận đủ bốn cây Horizon, ba cọ Quiet Shore và một cọ Last Postcard ở các vị trí hợp lệ; những vị trí khác bị loại khi không đủ khoảng trống.

Các file thay đổi (đường dẫn từ repo; [danh sách đầy đủ 64 file, gồm bàn giao](../../../test-results/hr-props/files.txt)):

- `public/world/lib/hr-prop-*-lod{0,1}.glb`, `hr-rock-*-lod{0,1}.glb`, `hr-palm-*-lod{0,1}.glb`, `hr-prop-atlas-*.ktx2`: 41 file mới; `public/world/lib/manifest.json` thêm 19 mục, giữ metadata/mục cũ.
- `assets/LICENSES.csv`: thêm đúng 41 dòng.
- `src/features/world/props/hr-props.ts`: chọn variant, cache lease, loader PBR deferred, fitting, instancing, LOD/quality/ownership.
- `src/features/world/zones/{horizon,quiet-shore,last-postcard,old-trail,milestones}-dressing.ts`: chuyển factory sang HR; layout các prop cũ giữ nguyên.
- `src/features/world/zones/hr-props-dressing.ts`: chọn các vị trí High tree/palm ngoài đường, nước và collider.
- `src/features/world/zones/workshop.ts`: giữ toàn bộ vertex cấu trúc; chỉ tách/thay phần dressing trong ba batch gỗ/đá/moss.
- `tools/assets/blender/hr-props{.py,-package.mjs,-review.mjs,-baseline.mjs,-HANDOFF.md}`: authoring, nén/manifest/license, viewer, đối chứng export A2 và bàn giao.
- `tools/assets/check-budgets.mjs`: nhận tên `hr-palm-*`, dùng reference loại tree.
- `tests/unit/world/hr-props{,-manifest}.test.ts`, `tests/unit/world/zones/{quiet-shore,workshop-dressing}.test.ts`: manifest/giải mã/license/map/LOD, deterministic variants, rigid fit, play gate, Low/failure/late dispose, và hồi quy vật liệu/số request mới.
- `tests/review/hr-props-{source,review,report}.mjs`: source smoke, chụp/đo production và tổng hợp ABBA.

Ba mở rộng cần ghi rõ: module mới trong `props/` làm cả runtime PBR thay vì chỉ chọn asset, vì loader cũ flatten và từ chối quá 300 tam giác; `zones/workshop.ts` là điểm nối thật của dressing, vì `workshop-dressing.ts` chỉ trả geometry; checker thêm loại palm để tên asset đúng ticket qua gate. Không đổi tính năng của ticket khác.

Gate cuối trước build:

```text
pnpm lint: exit 0, 0 warning
pnpm typecheck: exit 0
Test Files  189 passed (189)
Tests  1956 passed | 1 skipped (1957)
pnpm test: exit 0
check:assets: PASS, 120 GLB, errors=[]
check:licenses: RESULT: PASS, 189 public files
```

Log: `tmp/hr-props/{lint-final,typecheck-final,test-final,assets-final,licenses-final}.log`. Lượt đầu có một phép đo CPU Milestones 453/450 ms; không nới threshold. Hai lượt full unit sau đó pass, lượt cuối 74,14 s. Source smoke đầu dùng adaptive Low và thiếu JSON chỉ được sinh khi build; harness sau đã khóa High và phục vụ JSON từ export, lượt cuối không lỗi. Không dùng các lượt đó làm benchmark production.

Build **đúng một lần**, exit 0, sau thay đổi runtime/asset cuối:

```powershell
$env:NEXT_TEST_WASM_DIR='C:\Users\PC-LP\AppData\Local\next-swc\wasm\package'
$env:NEXT_BUILD_WEBPACK='1'
pnpm build
```

Log `tmp/hr-props/build.log`; [provenance](../../../test-results/hr-props/build-provenance.json), [kiểm hash/export](../../../test-results/hr-props/build-verification.json). 63 file khớp hash sau build, public copy không mismatch. Tài liệu bàn giao và bằng chứng được ghi tiếp sau build; mã/asset giữ nguyên.

E2e trên chính export này, config mặc định, Edge/SwiftShader như repository, không sửa spec/config:

```text
pnpm exec playwright test world --workers=2
43 passed (5.2m)
world e2e exit=0
```

Log `tmp/hr-props/e2e.log`. [Báo cáo ảnh + bảng ABBA/draw/triangle/byte/timing](../../../test-results/hr-props/report.md) có 30 mẫu: A1/B1/B2/A2 High và Low, mỗi lượt đủ sáu khu. Ảnh A1 lấy từ export `out/` có sẵn lúc nhận ticket; giữ HTML/JS ở `tmp/hr-props/baseline/` để chạy lại A2, dùng chung các asset cũ không bị sửa. Không build baseline lại trong phiên này. B1/B2/Low dùng build mới; cả năm lượt không có lỗi trình duyệt, kiểm đúng quality/focus/visibility và pose camera bằng nhau.

Đo Edge hardware WebGL **RTX 3060, 1600×900, DPR 1**, tuần tự, không chạy e2e/build/test cùng lúc. High warm-up 25 s, Low 4 s; mỗi mẫu 5 s. **12 mẫu B High đạt 68,81–100,18 FPS, PASS ngưỡng 60 FPS tại các pose đo**; không phải bảo đảm FPS mọi vị trí hoặc 1080p. Low sáu khu đạt 99,46–100,18 FPS, **0 request GLB/KTX2 HR prop/rock/palm**. Request asset mới sớm nhất ở B1/B2 bắt đầu sau playable lần lượt 18.241,70/15.016,00 ms; không đưa payload mới vào trước lúc chơi được.

Giữ cả biến động: Old Trail B1 68,81/B2 100,12 FPS; Last Postcard B1 99,22/B2 78,09 FPS. CPU ABBA là số toàn frame, không giảm ở mọi khu: Last Postcard trung bình A/B 202,78/486,21 ms/s, Horizon 388,15/509,09 ms/s. Draw/tam giác tăng do mô hình mới, cụ thể trong bảng. Máy dùng chung, animation/streaming vẫn chạy và export A1 có sẵn; không tuyên bố speedup nhân quả từ chênh lệch này. Tất cả raw JSON/log được giữ.

Giới hạn cần Lead giữ khi đánh giá: đây là thay dressing cục bộ, không thay mọi mesh trong `foliage/**`, đá bậc/đá tương tác hay shore/water systems. Không bake impostor mới cho cọ; runtime cọ có hai LOD và cull xa, cây đồi cũng dùng LOD0/1 của kho có sẵn. Loader giới hạn một worker và nạp tuần tự trong từng batch, nhưng các batch có thể nạp đồng thời với hệ cây/material cũ; có cảnh báo nhiều KTX loader trong source smoke. Low giữ cache HR nếu người dùng đã tải High trước đó. Ảnh vẫn cần Lead chấm art; không tuyên bố đã đạt phép thử phân biệt ảnh thật của HR-common.

Không cần nối thêm `index.ts` để dùng dressing đã tích hợp. Nếu Lead tiếp tục thay một batch cây cũ sau khi điều phối ownership với HR-LIGHT, API sau có thể dùng với mesh và các site đã trích từ đúng layout hiện hữu; **không tự quét/thay tất cả mesh trong scene**:

```ts
import { bindHrProps } from "./props/hr-props";
// legacyBatch + approvedSites must share the same local frame.
// approvedSites retain existing root positions, yaw and envelopes.
const hr = bindHrProps(legacyBatch, approvedSites, localHeightAt);
// Existing setBakedPropQuality traversal supplies quality.
// Register with the owning world/zone teardown:
releases.push(hr.dispose);
```

`tmp/` và `test-results/` bị gitignore: Lead cần giữ/copy log, ảnh, JSON/report khi thu worktree. File public/code/license đều để uncommitted cho Lead.

Đã đóng các browser và dừng hai server review do phiên này tạo. Xem lại bằng `node tools/serve-out/index.mjs out --port 4198`; đối chứng A2 bằng `node tools/assets/blender/hr-props-baseline.mjs` (port 4202, cần giữ snapshot trong `tmp/`). Không chạy build lại để xem export hiện có.
