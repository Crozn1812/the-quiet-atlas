# HR-FIX-WOOD — bàn giao

[Gallery trước/sau](../../../test-results/hr-fix-wood/index.html) · [Bảng đo](../../../test-results/hr-fix-wood/measurements.md) · [Review](../../../test-results/hr-fix-wood/review.json)

Đã triển khai sáu mục trong phạm vi ticket, giữ collider, layout, mốc tương tác và nội dung. Chưa commit. Không sửa index.ts hoặc file ngoài phạm vi; log/ảnh/snapshot là output kiểm tra.

| Mục | Ảnh cùng góc | Đã sửa | Giới hạn còn lại / lý do |
|---|---|---|---|
| A05 | [trước](../../../test-results/hr-fix-wood/before/first-light-close.webp) · [sau](../../../test-results/hr-fix-wood/after/first-light-close.webp) | Gỗ xẻ theo trục từng thanh; log/đá HR giữ envelope; thay fern và bụi authored understorey, không còn các khối xanh lớn trong góc audit. | Bìa/trang sách và hoa giữ hình gốc; bóng thân/cỏ chung thuộc ticket khác. |
| A07 | [trước](../../../test-results/hr-fix-wood/before/bridge-1.webp) · [sau](../../../test-results/hr-fix-wood/after/bridge-1.webp) | Hai cầu có vân gỗ theo mét và pha khác nhau mỗi instance, tay vịn chamfer, đầu đinh, rêu ảnh có mép rời. | Vân sàn ở góc chéo vẫn nhẹ; gỗ là bake authored, chưa có đối chứng ảnh chụp thật. Hình sàn/cao độ collider giữ nguyên. |
| A12 | [trước](../../../test-results/hr-fix-wood/before/workshop-overview.webp) · [sau](../../../test-results/hr-fix-wood/after/workshop-overview.webp) | Cột/xà/bàn đổi từ vỏ cây loang sang gỗ xẻ; mái có khe ván và rêu PBR; thêm chốt ở thanh/cột. | Silhouette công trình và mảng rêu mái lớn vẫn theo hình gốc; chưa nghiệm thu photoreal. Ngọn lửa A06 nằm ngoài ticket. |
| A13 | [trước](../../../test-results/hr-fix-wood/before/old-trail-close.webp) · [sau](../../../test-results/hr-fix-wood/after/old-trail-close.webp) | Đèn lathe tròn, vành cuốn, quai, lồng kính, đầu tán, bấc sáng; rêu khối đổi sang lá mảnh. | Kính alpha, chưa có refraction/caustics; dao động và collider gốc giữ nguyên. |
| A17 | [trước](../../../test-results/hr-fix-wood/before/signpost.webp) · [sau](../../../test-results/hr-fix-wood/after/signpost.webp) | Biển/cọc có thớ theo chiều riêng, mắt/khe gỗ, mép bevel và đinh; giữ toàn bộ chữ/hướng và mốc tương tác. | Thớ procedural còn khá đều ở cận; chưa nghiệm thu photoreal. Low giữ màu rẻ; chữ vẫn là lớp lettering có sẵn. |
| A21 | [trước](../../../test-results/hr-fix-wood/before/road-railing.webp) · [sau](../../../test-results/hr-fix-wood/after/road-railing.webp) | Thanh/cọc bo mép, ốc nối, lớp phủ 2K có lỗ rỗ/chip/bẩn chân, thay pha và sắc độ từng module; bollard 24 cạnh. | Module vẫn theo nhịp công trình và layout gốc; không thay collider hoặc dải đỏ/trắng. |

Bổ sung A07: [cầu 2 trước](../../../test-results/hr-fix-wood/before/bridge-2.webp) / [sau](../../../test-results/hr-fix-wood/after/bridge-2.webp). Có đủ 12 ảnh High + 1 Low trước/sau; pose được script đối chiếu bằng số, ảnh nguyên 1600×900 đã mở xem. Không dùng ảnh dev để nghiệm thu. Chưa thực hiện blind test so ảnh chụp thật; không khẳng định đã đạt photoreal toàn cảnh.

Gate:

| Lệnh | Kết quả / dòng tổng kết |
|---|---|
| pnpm lint | PASS, exit 0, eslint .; 0 warning |
| pnpm typecheck | PASS, exit 0, tsc --noEmit; không diagnostic |
| pnpm test | PASS, exit 0; Test Files 201 passed (201); Tests 2026 passed, 1 skipped (2027) |
| WASM + NEXT_BUILD_WEBPACK=1 pnpm build | PASS, exit 0; Compiled successfully in 3.6s; 22/22; đúng một lần sau thay đổi runtime cuối |
| E2E_PORT=4203 pnpm exec playwright test world --workers=2 | PASS, exit 0; 43 passed, config mặc định |
| pnpm check:assets | PASS, exit 0; report-only; worldBytes 170814440; startBytes 147096 |
| pnpm check:licenses | PASS, exit 0; public files 221; RESULT: PASS |

[Log gate](../../../test-results/hr-fix-wood/logs/) có output lệnh thật. Lượt lint đầu quét nhầm bản export baseline trong tmp, sinh lỗi/warning từ JS build; đã chuyển snapshot sang coverage (ignored sẵn), chạy pnpm lint đầy đủ lại PASS 0 warning, không đổi config/rule. Lượt unit đầu phát hiện tên batch First Light chưa giữ contract cũ và hook test thiếu renderer; đã sửa, suite đầy đủ cuối PASS. Shader moss dùng tên biến trùng reserved word đã được rà GPU và sửa trong dev trước build duy nhất.

Asset: 20115312 byte (19.18 MiB), xem [inventory](../../../tmp/hr-fix-wood/assets/packaged.json). Gỗ/lớp phủ là bề mặt tự author và bake bằng Blender, không tuyên bố là scan; source .py tái tạo được, CC0 dedication + URL từng file ở LICENSES.csv. Chỉ dùng cache CC0 hiện có cho log/đá/lá/rêu; không download hoặc AI-gen. Lantern gộp theo material, có LOD xa decimate. Carrier GLB chỉ dùng lấy material, không vẽ cube carrier trong world.

Lifecycle: các factory hiện có tự gắn detail; không cần nối mới vào index.ts. Giữ các lời gọi đang có, không thêm lần hai:

```ts
const bridges = createBridges();
const coastRoad = createCoastRoad();
const coastRailing = createCoastRailing(contentTargets);
// createProp và factory zone vẫn giữ chữ ký / dispose hiện có.
```

Không lưu trạng thái, không đổi gameplay/dependency/content. Low/software giữ fallback và không bắt đầu tải HR mới; nếu đã tải High rồi đổi Low, cache dùng chung được giữ tới dispose như cơ chế có sẵn. Số CPU/FPS là phiên đo trên máy đang có worker khác; không dùng làm benchmark độc lập.

File sửa/thêm:

- assets/LICENSES.csv
- public/world/lib/hr-prop-coastal-coating-lod0.glb
- public/world/lib/hr-prop-coastal-coating-lod1.glb
- public/world/lib/hr-prop-sawn-timber-lod0.glb
- public/world/lib/hr-prop-sawn-timber-lod1.glb
- public/world/lib/hr-prop-storm-lantern-lod0.glb
- public/world/lib/hr-prop-storm-lantern-lod1.glb
- public/world/lib/hr-wood-0aec884687416012.ktx2
- public/world/lib/hr-wood-10eb8b9409c460dd.ktx2
- public/world/lib/hr-wood-2931902a1cd8e92f.ktx2
- public/world/lib/hr-wood-c6ed62e2267eebbe.ktx2
- public/world/lib/hr-wood-d590f78a9d0fa9a7.ktx2
- public/world/lib/hr-wood-ef91dab3c20954fb.ktx2
- public/world/lib/manifest.json
- src/features/world/bridges/geometry.ts
- src/features/world/bridges/index.ts
- src/features/world/props/authored-detail.ts
- src/features/world/props/fasteners.ts
- src/features/world/props/hr-props.ts
- src/features/world/props/hr-structures.ts
- src/features/world/props/index.ts
- src/features/world/props/timber-surface.ts
- src/features/world/road/posts.ts
- src/features/world/road/railing.ts
- src/features/world/road/road.ts
- src/features/world/zones/first-light-dressing.ts
- tests/unit/world/hr-fix-wood.test.ts
- tests/unit/world/hr-props-manifest.test.ts
- tests/unit/world/zones/first-light-dressing.test.ts
- tools/assets/blender/hr-fix-wood-HANDOFF.md
- tools/assets/blender/hr-fix-wood-inspect.mjs
- tools/assets/blender/hr-fix-wood-package.mjs
- tools/assets/blender/hr-fix-wood-report.mjs
- tools/assets/blender/hr-fix-wood-review.mjs
- tools/assets/blender/hr-fix-wood.py

E2E summary chính xác: `43 passed (8.7m)`. Sau khi 43 case hoàn tất, runner chờ dọn server Windows; chỉ dừng PID 23740 do chính lượt Playwright này tạo (được ghi trong log), sau đó lệnh trả exit 0. Không dừng server của worker khác.

Thời gian vào chơi được đo với QA hook `__tqaSkipIntro=true` theo hr-audit.mjs; không gồm chuyến bay intro đầy đủ. A1 và B1 cách nhau thời gian thi công; chuỗi ABBA chỉ là số đo thô, không phải lượt benchmark liền nhau trên máy cô lập.
