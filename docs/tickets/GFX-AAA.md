# Đợt đồ họa "AAA": spike để Duy chọn hướng (2026-11-13)

Duy (vòng 2): "Đồ họa còn kém, muốn hướng AAA". Giới hạn thật: chạy trong trình duyệt trên laptop Iris Xe (T08 Low phải đạt). Mục tiêu là trông như game đầu tư kỹ, không phải đồ họa máy console.

Cả hai ticket dưới đây **không chạm world đang chạy** (`src/features/world/` do MAP-01/PERF-FL03 giữ). Chỉ làm trên bàn dựng style frame `tools/styleframes/` (Vite riêng, không vào web) và kho asset. Lead ghép vào world sau khi Duy chọn hướng.

Chung: áp `_common-b2.md`, `_graphics-common.md`. Không thêm dependency; addon của three có sẵn (`three/examples/jsm/...`: GTAOPass/SSAOPass, UnrealBloomPass, CSM, RGBELoader/EXRLoader, KTX2Loader) được dùng. Asset chỉ CC0 (Poly Haven, ambientCG, Kenney, Quaternius); mỗi file một dòng `assets/LICENSES.csv`. Không commit.

## GFX-01 — Ánh sáng và hậu kỳ (Codex C, Blender MCP cổng 9878)

Trong `tools/styleframes/`, dựng **3 biến thể** cho 3 cảnh First Light (rừng bình minh), Horizon (đồi ngắm biển), Last Postcard (đường ven biển lúc hoàng hôn):

- **A — R1 nâng cấp:** giữ khối mặt phẳng hiện tại; thêm bóng đổ mềm (CSM hoặc shadow map 2048 + PCF soft), AO (GTAO), bloom nhẹ, color grading theo `docs/art-bible/taste.md`, sương thể tích giả (lớp billboard/height fog), viền nắng rim light.
- **B — Painterly bán thực:** như A + chất liệu PBR cho đất, đá, vỏ cây (texture CC0 nén KTX2, 1K), môi trường HDRI CC0 làm ánh sáng nền (IBL), nước có phản chiếu trời + fresnel.
- **C — Gần thực:** như B + texture 2K, lá cây alpha-cutout có translucency, depth of field nhẹ.

Mỗi biến thể có preset Low/High; ghi chi phí: draw call, tam giác, ms/frame GPU (dùng `renderer.info` + `EXT_disjoint_timer_query_webgl2` nếu có) trên máy dev; Low phải chạy được trên iGPU (ước lượng, ghi rõ là ước lượng).

**Được sửa:** `tools/styleframes/**`, `tools/assets/textures/**`, `assets/` (nguồn CC0), `assets/LICENSES.csv`, `public/world/lib/` (chỉ file mới).
**Bàn giao:** 9 ảnh 1600×900 (3 cảnh × A/B/C, High) + 3 ảnh Low; bảng chi phí; tổng byte asset mới mỗi biến thể; ghi vào `docs/showcase/37-aaa/README.md` nháp (Lead sửa).

## GFX-02 — Kho asset CC0 (Antigravity, Blender MCP cổng 9879)

Dựng thư viện asset dùng chung cho biến thể B/C:
- 3–4 cây lá rộng + 2–3 thông, 4–6 đá/vách, bụi, dương xỉ, cỏ cụm, khúc gỗ đổ; ưu tiên Poly Haven qua Blender MCP (`import_asset`), tối ưu LOD0/LOD1 trong Blender (decimate), xuất GLB.
- Chạy `node tools/assets/optimize.mjs` (meshopt + KTX2). Mỗi mô hình: LOD0 ≤ 8 000 tam giác, LOD1 ≤ 2 000; texture ≤ 1K (KTX2).
- Ghi `public/world/lib/manifest.json` (id, đường dẫn, tam giác, byte, nguồn, giấy phép).

**Được sửa:** `public/world/lib/**`, `assets/lib/**` (nguồn .blend/ảnh gốc nếu giấy phép cho phép commit), `assets/LICENSES.csv` (chỉ thêm dòng), `tools/assets/blender/lib-*.py`.
**Không sửa:** `tools/styleframes/` (của GFX-01).
**Bàn giao:** `tools/review/AG-GFX-02-handoff.md`: danh sách asset + số liệu, ảnh xem trước contact sheet (`docs/showcase/37-aaa/lib-sheet.webp`), `pnpm check:licenses` + `pnpm check:assets` exit code.

Hai ticket cùng thêm dòng vào `assets/LICENSES.csv`: Lead gộp khi merge (xung đột chỉ là dòng thêm).
