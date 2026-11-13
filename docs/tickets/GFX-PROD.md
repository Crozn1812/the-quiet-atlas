# Đợt sản xuất đồ họa hướng C (ADR 0018)

Chung cho mọi ticket GFX-P*:
- Áp `_common-b2.md`, `_graphics-common.md`; đọc `docs/adr/0018-graphics-direction-c.md`, `docs/art-bible/taste.md`.
- Nguồn tham khảo đã có: bàn dựng `tools/styleframes/` (GFX-01: `createPost`, preset C, đo chi phí) trong nhánh `lane/GFX-01`; kho cây/đá `lane/GFX-02`. Lead merge hai nhánh này trước khi giao.
- Texture/HDRI/mô hình **CC0 thật** qua Blender MCP của bạn (Poly Haven) hoặc ambientCG; mỗi file một dòng `assets/LICENSES.csv`; KTX2 High 2K / Balanced 1K / Low 512; nạp **deferred** sau khi chơi được.
- Không sửa `src/features/world/layout/`, `zones/*`, `terrain/height.ts` (MAP-01). Nối `index.ts` ≤ 15 dòng, gọi qua module của ticket.
- Điều kiện xong: gate PASS; build một lần; e2e world `--workers=2`; ảnh High 8 khu (`ingame-shots.mjs`) + ảnh Low First Light; `check:assets` (tổng world ≤ 30 MB); ghi byte asset thêm. Lead đo CPU ABBA khi merge.

## GFX-P1 — Hậu kỳ và ánh sáng C vào runtime (Codex B)
Port `createPost` của GFX-01 vào `src/features/world/post/`: GTAO, bloom nhẹ, color grading, DOF nhẹ (chỉ High, tắt khi người chơi đang di chuyển), bóng đổ mềm, IBL từ HDRI CC0 (bình minh ở rừng, hoàng hôn ở biển, trộn theo `timeOfDayAt`). Thay paper pass ở Balanced/High; Low giữ render thẳng.
Được sửa: `src/features/world/post/**`, `sky/**`, `art/direction.ts`, `scene/compose.ts`, nối `index.ts`, `public/world/env/`, test.

## GFX-P2 — Vật liệu đất, đá, đường, vỏ cây bằng ảnh CC0 (Codex C)
Ảnh texture Poly Haven cho: đất rừng, cỏ nền, sỏi lòng suối, cát, đá vách/tảng, đường đất, nhựa đường, vỏ cây. Chống lặp (triplanar hoặc 2 tỷ lệ + nhiễu màu vùng). Áp vào terrain mesh, vách núi First Light, đá rải, đường.
Được sửa: `src/features/world/materials/**`, `terrain/mesh.ts`, `terrain/detail.ts`, `terrain/spring.ts` (chỉ vật liệu), `road/*` (chỉ vật liệu), `tools/assets/textures/**`, `public/world/tex/`, test.

## GFX-P3 — Cây hướng C (Codex A, sau GFX-02 vòng 2)
Thay cây procedural ở rừng và đồi bằng kho GFX-02: lá alpha-cutout có translucency, tán khối, LOD0/LOD1 + impostor xa; giữ tán kín trời của FL-03 (sky-fraction đạt 4 khu rừng) và cây elf Roots. Sửa lỗi "lá thành tấm phẳng sọc" của spike C.
Được sửa: `src/features/world/foliage/**`, `public/world/lib/`, `tools/assets/blender/lib-*`, test.

## GFX-P4 — Nước hướng C (Codex D, sau MAP-01)
Suối và biển: phản chiếu trời (IBL/planar rẻ), Fresnel, độ trong theo độ sâu, bọt nhẹ ở bờ và thác First Light. Giữ cá và lội suối.
Được sửa: `src/features/world/water/**`, `shore/*` (chỉ vật liệu), test.

Sau P1–P4: mỗi khu một ticket dressing (đá, cây, vật thể theo khu) dùng hệ mới, cả đội cùng làm.

## GFX-P5 — Nhân vật và xe GD110 hướng C (Codex D)
Nhân vật (rig 19 xương, đi/chạy/ngồi/lái giữ nguyên) và xe GD110: chất liệu PBR (vải áo trơn, quần, da, tóc, kính; sơn xe, kim loại, cao su lốp, da yên), normal/roughness từ texture CC0 hoặc bake trong Blender, tỷ lệ và dáng theo turnaround D-23 (không logo Chiefs, không chữ Suzuki). Mặt và tay mịn hơn (subdivision trước khi bake, LOD cho xa). Giữ ≤ 30 000 tam giác nhân vật, ≤ 25 000 xe; nạp deferred nếu tăng thời gian tới lúc chơi được.
Được sửa: `src/features/world/character/**`, `src/features/world/vehicle/**` (chỉ mesh/vật liệu), `tools/assets/blender/character*`, `tools/assets/blender/gd110*`, `public/world/character/`, `public/world/vehicle/`, LICENSES, test. Ảnh: cận nhân vật 3 góc + xe 3 góc (High) và 8 khu.

## GFX-P6 — Intro và ending hướng C (Codex B)
Intro (bình minh First Light) và ending (hoàng hôn Last Postcard) dùng hệ C đã merge: IBL/hậu kỳ GFX-P1 (`post/cinematic.ts`, `post/runtime.ts`), cây GFX-P3, nước GFX-P4. Chỉnh khung máy quay, ánh sáng, grading và DOF riêng cho cinematic (DOF được dùng ở cinematic cả Balanced; tắt ở Low). Giữ thời lượng, phụ đề, nút bỏ qua, reduced-motion, và `data-world-build` không chờ asset C.
Được sửa: `src/features/world/cinematic/**`, `post/cinematic.ts`, test. Không sửa `index.ts` (nếu cần nối, ≤ 5 dòng và ghi trong bàn giao).
Ảnh: 6 khung intro + 6 khung ending (High) + 1 khung Low mỗi đoạn; video 30–60 s mỗi đoạn vào `docs/showcase/38-c/` nếu ghi được.

## GFX-Z* — Dressing từng khu hướng C (mỗi khu một ticket)
Chung: dùng hệ đã merge (P1 post/IBL, P3 cây, P4 nước; P2 vật liệu khi đã merge) và kho `public/world/lib` (đá boulder 1–4, dương xỉ, bụi, cỏ, khúc gỗ đổ, cây). Làm khu trông như ảnh thật chụp tại chỗ theo `docs/art-bible/taste.md` và nội dung khu trong spec: nhóm đá có chủ đích, bụi/dương xỉ ở mép đường và gốc cây, cỏ cao theo vùng sáng, khúc gỗ đổ, vật thể đặc trưng khu đổi sang PBR. Giữ nguyên vị trí điểm tương tác, collider đường đi, trigger, nội dung chữ.
- **CPU:** đo đơn của GFX-P6 cho thấy First Light/Workshop đã cao hơn bản cũ ~+20 ms/s. Mọi vật dressing phải **instanced/batched** (`props/batched.ts`), không thêm object có update mỗi frame, cull theo khoảng cách; báo số draw call và tam giác trước/sau.
- Asset mới (nếu có) CC0, deferred, có dòng LICENSES; ghi byte thêm.
- Được sửa: `src/features/world/zones/<khu>.ts`, file mới `src/features/world/zones/<khu>-dressing.ts`, `src/features/world/props/**` chỉ thêm file mới (không sửa file chung trừ khi ghi rõ lý do), test của khu.
- Không sửa: `index.ts`, `layout/`, `terrain/`, `materials/`, `road/`, `foliage/`, `water/`, khu khác.
- Xong: gate PASS; build một lần; e2e world `--workers=2` config mặc định; ảnh High 3 góc của khu (trước/sau) + Low 1 góc; `check:assets`. Không commit.
