# GFX-P5 / lead3 — bàn giao W-A

2026-11-14 · `lane/GFX-P5` · nền `e92409b` (có P2). Không commit. Báo cáo này thay return2; bản cũ lưu ở `test-results/gfx-p5/return2-handoff.md`.

**Ba gate bắt buộc đều exit 0; chưa đủ điều kiện nghiệm thu toàn ticket.** E2E world chưa ổn định 43/43; một cold load VI vượt trần đồ họa 6 s; trần tổng world 12,1 MB của return2 vẫn FAIL. Không đổi test e2e, timeout, logic xe hay asset của ticket khác để lấy PASS.

## Hoàn tất vòng lead3

- Giữ sửa của Lead: Low, adaptive Low, software, LOD xa và lúc scenery pending dùng đúng object vật liệu gốc của main. Bỏ import thừa `Color` / `MeshBasicMaterial`; không tạo vật liệu phẳng mới.
- Cập nhật unit test so sánh identity vật liệu gốc, thêm xác nhận geometry/material lúc scenery pending; appearance không dispose vật liệu gốc, owner character/vehicle chịu trách nhiệm. Giữ các ca deferred, late completion, transition guard, fetch failure, rig order, LOD và budget (13 ca).
- Cập nhật viewer để kiểm tra identity vật liệu gốc ở Low/software. High vẫn dùng PBR, atlas dùng chung; không đổi rig, animation hay geometry/asset trong vòng này.
- Build WASM/webpack **đúng một lần** sau sửa code, `out/index.html` lúc 05:23:40. Không sửa runtime hoặc asset sau build. Đối chứng tắt appearance chỉ biến đổi response JS tại server chẩn đoán, không sửa `out/` hay source và không build lại.

## Lệnh và kết quả

Dùng `pnpm.cmd` do PowerShell ExecutionPolicy; không đổi package/config.

| Lệnh | Dòng tổng kết / exit |
| --- | --- |
| `pnpm.cmd lint` | `$ eslint .`; 0 warning; exit 0 (lần cuối, `lead3-lint.log`) |
| `pnpm.cmd typecheck` | `$ tsc --noEmit`; exit 0 |
| `pnpm.cmd test` | `Test Files 161 passed (161)`; `Tests 1821 passed (1821)`; `Duration 63.49s`; exit 0 |
| `pnpm.cmd build` (env dưới) | `Compiled successfully in 2.3s`; `Generating static pages (22/22)`; exit 0 |
| `pnpm.cmd check:assets` | `status: PASS`; `worldBytes: 15304082`; `startBytes: 147096`; `errors: []`; exit 0 |
| `pnpm.cmd check:licenses` | `public files: 83`; `RESULT: PASS`; exit 0 |
| `pnpm.cmd check:bundle` | Welcome JS gzip 134.6 KB <150 KB; `RESULT: PASS`; exit 0 |
| `pnpm.cmd check:leaks` | `RESULT: PASS`; exit 0; R5 NOT RUN vì chưa đặt `TQA_DENYLIST_FILE` |
| `git diff --check` | exit 0 |

```powershell
$env:NEXT_TEST_WASM_DIR='C:\Users\PC-LP\AppData\Local\next-swc\wasm\package'
$env:NEXT_BUILD_WEBPACK='1'
pnpm.cmd build
```

Có một lần lint chạy trong lúc Playwright ghi file JS vào `.playwright-artifacts-*`, nên quét nhầm tài nguyên sinh ra và FAIL. Sau khi browser suite kết thúc và runner dọn thư mục tạm, chạy lại nguyên lệnh `pnpm.cmd lint`: exit 0, 0 warning. Không sửa config hoặc rule để bỏ lỗi.

## E2E world — ba lượt trên cùng build

Lệnh: `E2E_PORT=4517 pnpm.cmd exec playwright test world --workers=2 --output=test-results/gfx-p5/lead3-world-N`. Dùng config mặc định; chỉ đổi port/output. Không chạy ảnh/perf cùng browser suite.

| Lượt | Kết quả |
| --- | --- |
| 1 | List reporter ghi 42 ca pass, 1 fail (E while rolling, dòng 45). Sau ca cuối runner kẹt teardown, không in summary; đã Ctrl-C, exit 1. Không ghi lượt này PASS. |
| 2 | `43 passed (4.3m)`; exit 0 |
| 3 | `2 failed`, `41 passed (4.5m)`; exit 1; brake to rest và E while rolling đều timeout mount dòng 45 |

Lượt 2/3 dùng server `serve-out` tự mở trước, được config mặc định reuse, tránh kẹt shutdown server ở lượt 1. Log và trace giữ trong `test-results/gfx-p5/lead3-world-{1,2,3}{,.log}`. Các trace fail có 0 request `/world/character/`; world `done`, không paused, trang có focus và visible ở snapshot cuối. Không kết luận texture upload là nguyên nhân.

## Đối chứng cùng spec khi tắt hẳn appearance

Chạy nguyên `world-vehicle.spec.ts --workers=2 --trace=on`, không sửa spec/timeout. Hai server cùng phục vụ build trên; server tắt chèn return sớm vào đúng một hàm `installBakedAppearance` trong response chunk. Cả hai server chèn cùng probe đọc pose mỗi 100 ms; không can thiệp input, dt, transition hay duration. Đây là chẩn đoán, không phải CPU ABBA hoặc export main độc lập.

| Bản | Kết quả spec | E → mount false: brake to rest | E → mount false: E while rolling |
| --- | --- | ---: | ---: |
| Tắt appearance | `1 failed`, `2 passed (1.4m)`; exit 1 | 11.516 s | Không quan sát được false trước khi test dừng; dòng 45 FAIL |
| Bật appearance | `3 passed (1.6m)`; exit 0 | 13.551 s | 13.419 s |

Dismount ở hai ca đầy đủ: tắt 10.992 s; bật 12.893 / 16.061 s. Với E during mount, lần nhấn E thứ hai tới false: tắt 16.966 s, bật 20.451 s. Đây là thời gian quan sát bằng timer trên main thread; SwiftShader có thể trì hoãn callback/poll, nên không suy ra chênh CPU hay duration mô phỏng từ các số này. Ca fail không được gán một thời gian hoàn tất giả định. Trace lượt world 1 vẫn còn true khoảng 17,10 s sau action nhấn E.

**Kết luận có bằng chứng:** lỗi mount vẫn xuất hiện khi không cài appearance; sửa vật liệu không bảo đảm hết timeout. Cần Lead xử lý tiếp hoặc tách lỗi này; không đổi logic xe trong ticket P5. File tổng hợp: `test-results/gfx-p5/lead3-trace-report.json`; log/trace nguyên gốc: `lead3-vehicle-{disabled,enabled}{,.log}`. Các server chẩn đoán đã dừng; flag chỉ nằm trong script scratch ignored `tmp/gfx-p5/diagnostic-server.mjs`, không có flag trong production source.

## Load-budget

`PERF_PORT=4519 pnpm.cmd exec playwright test -c tests/perf/playwright.perf.config.ts load-budget`: **`2 passed (1.2m)`, exit 0**. Mỗi locale 3 cold load, 10 Mbps / RTT 100 ms, CPU throttle 1, Edge 157, i5-14400F / RTX 3060, Balanced, 1366×800, DPR 1. Không phải máy Iris Xe nghiệm thu.

| Locale | Lần 1 | Lần 2 | Lần 3 | Gate repo ≤10 s | Gate đồ họa ≤6 s |
| --- | ---: | ---: | ---: | --- | --- |
| EN | 5.593 s | 5.598 s | 5.588 s | PASS | PASS |
| VI | 5.804 s | 6.330 s | 5.799 s | PASS | FAIL |

Cả 6 lượt: 0 request 3D trước Enter World; Enter World → playable **2.162.812 byte <8 MB**. Không gọi gate 6 s PASS vì một lượt VI trượt. Báo cáo riêng vòng này: `test-results/gfx-p5/lead3-load-budget-{en,vi}.json`, `lead3-load-budget.log`; báo cáo Markdown gốc ở `test-results/load-budget/`.

## Hình ảnh và số đo

- High đủ 8 khu trước/sau trên **cùng build**, locale VI, quality pin high: `lead3-before/` (appearance tắt qua response) và `lead3-after/`. Đây là đối chứng appearance, không phải build main mới.
- Low đủ 8 khu, gồm First Light: `lead3-low/`. Đã xem ảnh Low First Light và sheet High 8 khu.
- `node tools/assets/blender/character-review.mjs`: exit 0, 15 ảnh trong `lead3-closeups/`. High: PBR/normal/UV true, normal 1024, cùng atlas UUID cho nhân vật/xe, đúng 3 request (1 normal + 1 ORM + 1 GLB), errors [].
- `CHARACTER_REVIEW_SOFTWARE=1 node tools/assets/blender/character-review.mjs`: exit 0, 15 ảnh trong `lead3-software/`. Hai mesh `original: true`, PBR/normal false, requests [], errors [].
- Đã xem sheet cận return2 (trên) / lead3 (dưới): `lead3-closeups-sheet.png`. Không có thay đổi nhìn thấy ở High do sửa fallback. Mặt/tay mịn hơn mesh gốc, nhưng vẫn thấy ghép khối ở khớp khi rất gần; không dựng lại toàn silhouette trong vòng kiểm chứng này.

| Khu | Luma trước | Sau | Delta |
| --- | ---: | ---: | ---: |
| First Light | .506799 | .507800 | +.001002 |
| Workshop | .515846 | .516289 | +.000443 |
| Roots | .517726 | .518189 | +.000463 |
| Milestones | .490567 | .491153 | +.000586 |
| Old Trail | .480153 | .480252 | +.000099 |
| Horizon | .607367 | .607446 | +.000079 |
| Quiet Shore | .411504 | .411705 | +.000201 |
| Last Postcard | .390093 | .390365 | +.000272 |

Tất cả trong ±.03; max ground hue delta .475°. `tmp/gfx-p5/lead3-visual-report.mjs`, `tools/review/luma.mjs`, `tools/review/ground-hue.mjs` đều exit 0; kết quả `lead3-visual-gates.json`, `lead3-after-sheet.png`.

## Asset và ngân sách còn lại

Không đổi asset trong vòng lead3. P5 tổng **778.371 byte / 5 file**, dưới trần thêm 2.000.000 byte. Giữ một atlas 9 ô, High 1K / Balanced 512, Low/software không tải bake. Normal UASTC, ORM ETC1S; không thêm albedo/AO riêng. Cache chia sẻ atlas theo renderer/tier, deferred sau playable/scenery done, giữ guard hoãn request/upload/áp bundle bake khi transition và cleanup đã có. Adaptive Low vẫn trả về vật liệu gốc ngay.

| File trong public/world/character | Trước giảm ở return2 | Hiện tại |
| --- | ---: | ---: |
| character-duy-c.glb | 147492 | 147492 |
| normal-2048.ktx2 | 1537161 | 0 (bỏ) |
| orm-2048.ktx2 | 877518 | 0 (bỏ) |
| normal-1024.ktx2 | 460018 | 460018 |
| orm-1024.ktx2 | 331316 | 32953 |
| normal-512.ktx2 | 126551 | 126551 |
| orm-512.ktx2 | 109545 | 11357 |
| Tổng | 3589601 | 778371 |

`check:assets` PASS theo trần repo 30 MB. **Trần riêng return2 12,1 MB: FAIL** — tổng 15.304.082 byte; riêng file tracked của main `e92409b` đã 14.525.711 byte trước P5. Không giảm/xóa P2 hoặc asset ticket khác. Nhân vật 7.784 tam giác gốc/Low/xa → 10.544 gần High/Balanced; xe 7.452 → 7.452. Một draw màu/mesh trước và sau; không thêm pass riêng, chưa cộng shadow/post toàn cảnh. Rig 19 xương và 4 pivot giữ nguyên. CPU ABBA và GPU/FPS trên Iris Xe: NOT RUN, giao Lead theo GFX-PROD.

## File bàn giao (16)

1. `assets/LICENSES.csv`: 5 dòng asset project-owned.
2. `src/features/world/character/baked-appearance.ts`: atlas, deferred, tier/LOD, transition guard, fallback gốc, cleanup.
3. `src/features/world/character/loader.ts`: tự cài appearance cho skin 19 xương.
4. `src/features/world/character/runtime.ts`: dispose appearance trước tài nguyên gốc.
5. `src/features/world/character/ride.ts`: chỉ nối hàm đọc transition vào appearance; không đổi pose/motion.
6. `src/features/world/vehicle/mesh.ts`: giữ normals, UV atlas, install/dispose appearance.
7. `tests/unit/world/baked-appearance.test.ts`: 13 ca, fallback identity và resource lifecycle.
8. `tools/assets/blender/character_c.py`: nguồn bake cô lập, giữ rig, subdivision mặt/tay.
9. `tools/assets/blender/character-c-package.mjs`: meshopt/ETC1S/UASTC, tier 1K/512, license.
10. `tools/assets/blender/character-review.mjs`: viewer High/Low/software, atlas chung, fallback identity.
11. `tools/assets/blender/character-handoff.md`: báo cáo này.
12. `public/world/character/character-duy-c.glb`.
13. `public/world/character/normal-1024.ktx2`.
14. `public/world/character/normal-512.ktx2`.
15. `public/world/character/orm-1024.ktx2`.
16. `public/world/character/orm-512.ktx2`.

Không có file bàn giao ngoài phạm vi. Scratch/log/ảnh/trace nằm trong `tmp/`, `test-results/` ignored. Không sửa index/package/lock/config/docs/e2e/perf, không dependency/download/storage mới, không reset Blender. Không commit/deploy. Các viewer tự đóng; đã dừng toàn bộ server riêng 4517/4519/4520/4521, không can thiệp server của worker khác.

## Lead nối index.ts

**0 dòng cần thêm.** Wiring hiện có gọi `loadCharacter`, `createGd110`, `createRiderPose`; appearance và guard tự cài ở các hàm đó. Giữ cleanup hiện có `character.dispose()` / `disposeGd110()`. Không có snippet cần áp thêm.
