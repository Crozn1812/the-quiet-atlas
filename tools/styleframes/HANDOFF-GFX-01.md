# GFX-01 — bàn giao cho Lead

2026-11-13 · spike ánh sáng/chất liệu độc lập; chưa tích hợp world · không commit.

[Showcase](../../docs/showcase/37-aaa/README.md) có 9 ảnh High A/B/C cho First Light, Horizon, Last Postcard, thêm 3 ảnh B Low, tất cả 1600×900. [results.json](../../docs/showcase/37-aaa/results.json) chứa số đo gốc 18 cấu hình trên Edge/ANGLE RTX 3060: draw calls, tam giác qua cả shadow/post, GPU timer p50/p95, CPU submit, RAF. Byte asset: A 0; B High/Low 3.932.704; C High 12.687.385, Low 4.062.906.

## File bàn giao

Phần đã có khi tiếp tục, giữ nguyên nội dung:

- `assets/LICENSES.csv`: thêm 15 dòng project-original CC0-1.0.
- `tools/assets/textures/generate-aaa.mjs`: sinh lại texture/HDR bằng KTX-Software có sẵn, không tải file ngoài.
- `public/world/lib/gfx01/`: `ground-1024.ktx2`, `ground-normal-1024.ktx2`, `rock-1024.ktx2`, `rock-normal-1024.ktx2`, `bark-1024.ktx2`, `bark-normal-1024.ktx2`, `leaves-1024.ktx2`; cùng bảy tên ở độ phân giải `2048`; `sky.hdr`.
- `tools/styleframes/aaa.html`, `tools/styleframes/capture-aaa.mjs` (runner cũ).
- `tools/styleframes/aaa/`: `asset-bytes.json`, `atmosphere.ts`, `main.ts`, `materials.ts`, `metrics.ts`, `post.ts`, `scene.ts`, `settings.ts`, `report.mjs`, `verify.mjs`.

Phần hoàn tất lượt này:

- `tools/styleframes/gfx01.vite.config.mjs`: config riêng của spike, dùng lại config Vite hiện có; cache trong `.verify-dist/` đã ignore; chỉ scan `aaa.html`.
- `tools/styleframes/capture-gfx01.mjs`: runner hiện dùng, cùng phép đo với runner cũ; lưu `results.json` cùng ảnh và gọi generator báo cáo hoàn chỉnh.
- `tools/styleframes/report-gfx01.mjs`: tái sinh README từ số đo thật, hướng dẫn chạy, byte và giới hạn; không còn trạng thái draft bị chặn Edge.
- `tools/styleframes/verify-gfx01.mjs`: kiểm đủ 18 cấu hình duy nhất, 12 PNG đúng 1600×900, liên kết ảnh và tổng byte đúng file, lỗi JS/HTTP rỗng.
- `docs/showcase/37-aaa/README.md`, `results.json`, và 12 ảnh: `{first-light,horizon,last-postcard}-{A,B,C}-High.png`, `{first-light,horizon,last-postcard}-B-Low.png`.
- `tools/styleframes/HANDOFF-GFX-01.md`: file này.

README/ảnh/JSON dưới `docs/showcase/37-aaa/` là ngoại lệ được phần bàn giao GFX-01 và yêu cầu Lead chỉ định. Config mới nằm trong phạm vi `tools/styleframes/**`; không sửa config gốc, package/lockfile, runtime hoặc ticket khác. Một số thư mục/file từ phiên trước thiếu quyền ghi với token phiên hiện tại; tạo runner/config/report mới ở thư mục cha ghi được, không đổi ACL. Log/cache mới ở `tools/styleframes/.verify-dist/`, không bàn giao vào Git.

## Chạy và kiểm tra

PowerShell dùng `pnpm.cmd` nếu execution policy chặn shim `pnpm.ps1`.

```powershell
pnpm.cmd exec vite tools/styleframes --config tools/styleframes/gfx01.vite.config.mjs --configLoader native
# terminal thứ hai:
node tools/styleframes/capture-gfx01.mjs
node tools/styleframes/aaa/verify.mjs
node tools/styleframes/verify-gfx01.mjs
```

Mở `http://127.0.0.1:4190/aaa.html`; UI chọn scene/variant/quality, H ẩn bảng. State chỉ trong memory. Capture dùng browser Edge thật, không dùng Blender để thay ảnh render WebGL. Không cần gọi Blender MCP 9880 ở bước hoàn tất này.

Kết quả xác minh (log thô tại `.verify-dist/`):

```text
pnpm lint: $ eslint . — exit 0, 0 errors, 0 warnings
pnpm typecheck: $ tsc --noEmit — exit 0
pnpm test --configLoader native --no-cache --maxWorkers=4 --testTimeout=60000 — exit 0
Test Files  152 passed (152)
Tests       1774 passed (1774)
Duration    113.95s
pnpm check:licenses: public files: 54; RESULT: PASS — exit 0
node tools/styleframes/aaa/verify.mjs:
PASS: meter warm-up, sample cap, missing timer, disjoint reset, query disposal.
PASS: 15 asset sizes, CC0 rows, KTX2 dimensions/mips, RGBE HDR radiance.
node tools/styleframes/verify-gfx01.mjs:
PASS: 18 unique measured configurations, 12 PNG 1600x900, asset byte totals, README image links, no browser/HTTP errors.
capture: PASS: 18 configurations; 12 PNG 1600x900; no browser/HTTP errors.
smoke runner/config mới: PASS: 3 configurations; 3 PNG 1600x900; no browser/HTTP errors.
```

Test mặc định bị EPERM ghi `node_modules/.vite-temp`; dùng config loader native và tắt cache để chạy cùng suite/config, không bỏ test. Lượt chạy song song với build bị timeout 15 s ở `tools/assets.test.ts` và `world/secrets-wiring.test.ts` (150 file/1772 test còn lại pass). Lượt đầy đủ với 2 worker vẫn có hai timeout 15 s trong `secrets-wiring.test.ts` (151 file/1772 test còn lại pass). Lượt cuối dùng 4 worker và timeout CLI 60 s do tải máy dùng chung; không sửa config hay assertion/test, không dùng retry hoặc bỏ test. Log lần cuối: `.verify-dist/gfx01-test-complete.log`.

Smoke config mới đã chạy lại ba cảnh B High vào `.verify-dist/preview/`; số ảnh/số đo chính thức trong showcase giữ nguyên lượt đo đầy đủ. Nếu tự chuyển vị trí thư mục cache Vite, khởi động thêm `--force` một lần để dựng lại đường dẫn dependency tương đối; không chuyển cache giữa máy/worktree.

Build **đúng một lần trong lượt tiếp tục này**, exit 0:

```powershell
$env:NEXT_TEST_WASM_DIR = 'C:\Users\PC-LP\AppData\Local\next-swc\wasm\package'
$env:NEXT_BUILD_WEBPACK = '1'
pnpm.cmd build
```

```text
✓ Compiled successfully in 38.5s
Finished TypeScript in 9.8s
Static/SSG export, CV PDF và 16 ảnh OG được tạo thành công; exit 0.
```

## Giới hạn và bước Lead tích hợp

- GPU dev RTX 3060, không phải Iris Xe. Low chỉ ước lượng giảm tải: 42,25% số pixel High, ít cây/cỏ/lá hơn, tắt GTAO/bloom/DOF. T08/30 FPS trên iGPU chưa nghiệm thu. GPU/RAF chỉ là phép khảo sát 120+ mẫu; không dùng thứ tự p50 nhỏ để khẳng định C nhanh hơn A trên máy dùng chung.
- C High có asset 12,69 MB và tam giác qua pass hơn A khoảng 49%; phải giảm leaf/pass, tải trì hoãn rồi đo gate world 8 MB/+25% trước khi ship. B/C lộ vân procedural; C có leaf card tiền cảnh lớn, back scatter giả lập và DOF/AO dùng tán đặc xấp xỉ. Three có warning tham số material undefined dùng mặc định; không có browser error. Đây là bản nháp chọn hướng, chưa đạt hình cây gần thực hoàn chỉnh.
- Không tích hợp asset GFX-02. Gate ảnh đủ 8 khu/luma, world load-budget/CPU so main, e2e toàn tuyến và Lighthouse do Lead chạy sau khi port, vì ticket này không thay world.
- Lead chờ Duy chọn A/B/C rồi port thông số từ `aaa/settings.ts`, `post.ts`, `materials.ts`, `atmosphere.ts` sang module runtime thuộc ticket tích hợp. Không import `tools/styleframes` vào `index.ts`. Ghép hậu kỳ vào pipeline `paper` hiện có, tránh hai tone mapping/output pass; gọi resize/setQuality/dispose theo lifecycle đang có.

Ví dụ chỉ phần shadow tại `index.ts` sau khi có `gpu` và `sun`, và gọi lại khi đổi quality (11 dòng; cần Lead quyết định trước khi áp dụng):

```ts
import { PCFShadowMap } from 'three';
function applyStudyShadow() {
  const size = quality === 'High' ? 2048 : 1024;
  gpu.shadowMap.type = PCFShadowMap;
  gpu.shadowMap.enabled = sun.castShadow = true;
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.needsUpdate = true;
}
applyStudyShadow();
```

Ảnh hiện tại là bàn dựng cùng seed/camera, không phải ảnh tuyến world; index.ts chưa thay đổi. Lead giữ quyền duyệt gu và commit.
