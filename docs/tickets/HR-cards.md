# Các ticket đợt siêu thực (đọc `HR-common.md` trước)

## HR-TREE1 — Kho cây siêu thực đa dạng (asset)
Tạo trong Blender (Sapling Tree Gen / geometry nodes) + texture vỏ/lá CC0: **≥ 12 cây khác nhau** cho rừng nhiệt đới Việt Nam (cây gỗ lớn có bạnh rễ, cây tán rộng, cây thân mảnh, tre/trúc bụi, cây đổ nghiêng, cây chết khô), **cành chằng chịt** nhiều cấp, **dây leo quấn quanh thân/cành** (Ivy Gen) ở ít nhất 5 cây, rêu ở gốc. Lá: alpha-cutout cụm lá thật (texture lá CC0), 2 mặt, translucency. Mỗi cây LOD0/LOD1/impostor. Ghi tam giác, byte từng cây.
Được sửa: `tools/assets/blender/hr-trees*`, `public/world/lib/hr-*`, `public/world/lib/manifest.json` (chỉ thêm), LICENSES, test manifest. Không sửa `src/features/world/foliage/**` (HR-TREE2).

## HR-TREE2 — Rừng không cây nào giống nhau (runtime, sau HR-TREE1)
Thay cây trong rừng/đồi bằng kho HR-TREE1: chọn biến thể theo sinh cảnh (ven suối, sườn đồi, rừng sâu, bìa rừng), xoay/tỉ lệ/nghiêng/màu lá ngẫu nhiên theo seed, **không hai cây giống nhau đứng gần**; tầng dưới tán: dương xỉ, bụi, cây con, gỗ mục; dây leo rủ từ cành. Gió lay theo tầng (thân/cành/lá) trong shader. Giữ collider, tán kín trời FL-03, cây elf Roots.
Được sửa: `src/features/world/foliage/**`, test.

## HR-STREAMBED — Lòng suối: đá sỏi, rêu, rong
Lòng suối và mép suối: **sỏi** nhiều cỡ (instanced, texture CC0) dưới nước nhìn thấy được, **đá tảng** nhô lên mặt nước có **rêu** xanh ở phần ẩm, **rong** dưới nước lay theo dòng (shader), lá rụng trôi chậm, bọt quanh đá. Bám `water/depth.ts`, không chắn lội suối/cầu/cá.
Được sửa: file mới `src/features/world/water/streambed*.ts`, `public/world/streambed/`, LICENSES, test; nối `index.ts` ≤ 5 dòng. Không sửa `water/ribbon.ts`, `water/material.ts` (STREAM-C).

## HR-BIRDS — Chim bay và hót
Đàn chim nhỏ bay lượn trên tán (đập cánh, lượn, đổi hướng), vài con **đậu trên cành rồi bay đi** khi người chơi lại gần; chim biển (hải âu) ở bờ biển. Âm: **tiếng chim hót** theo không gian (gắn vị trí, to dần khi lại gần cây có chim), nhiều loài, ngẫu nhiên; buổi chiều thưa hơn. Âm CC0 (Freesound CC0, ghi URL) hoặc tổng hợp; tôn trọng tắt tiếng; không phát trước tương tác.
Được sửa: file mới `src/features/world/fauna/**`, `src/features/audio/**` (kênh `birds`), `public/audio/birds/`, LICENSES, test; nối `index.ts` ≤ 5 dòng.

## HR-CLIFF — Vách đá First Light thật (lỗi 3)
Thay vách bậc thang vuông bằng **vách đá điêu khắc**: mô hình đá/vách CC0 (Poly Haven rock/cliff scans) hoặc sculpt + bake trong Blender; khe nứt, gờ, rêu và dương xỉ mọc trong khe, thác nhỏ giữ nguyên chỗ. Không còn mặt phẳng ngang/đứng to nhìn thấy được.
Được sửa: `src/features/world/zones/first-light*.ts` (chỉ vách), `terrain/detail.ts` (chỉ vách), `public/world/cliff/`, LICENSES, test.

## HR-SEA — Biển Last Postcard/Quiet Shore có ánh sáng (lỗi 5)
Biển hiện tối đặc ở góc cao. Hoàng hôn: **vệt nắng vàng trên mặt biển** (specular sun glitter), màu nước theo độ sâu (gần bờ xanh ngọc trong, xa xanh đậm), phản chiếu trời, sóng nhỏ normal map nhiều tần số, sương biển chân trời. Giữ sóng vỗ SURF-01.
Được sửa: `src/features/world/water/sea.ts`, `water/surface.ts` (phần biển), `shore/**` (vật liệu), test.

## HR-ROOTS-SIGN — Bảng Roots (lỗi 6)
Bảng kỹ năng Roots: chữ quá to, kiểu chữ không hợp. Đổi thành **bảng gỗ thật** (texture gỗ CC0), chữ khắc/sơn tay cỡ vừa, font tự host có dấu tiếng Việt đang dùng ở overlay; giữ nội dung từ `src/content`.
Được sửa: `src/features/world/zones/roots*.ts` (chỉ bảng), test.

## HR-LIGHT — Ánh sáng, khí quyển, mặt đất (toàn cảnh)
Tia nắng xuyên tán (god rays), sương mù theo độ cao và khoảng cách (aerial perspective), bóng mềm tiếp xúc, AO dưới tán đậm hơn; mặt đất rừng: thảm lá mục, rễ nổi, cỏ 3D dày ở chỗ sáng (instanced, shader). Grading theo taste brief, exposure tự nhiên. Chỉ High/Balanced; Low giữ như cũ.
Được sửa: `src/features/world/post/**`, `sky/**`, `foliage/ground*.ts`, test. Không sửa cây (HR-TREE2).
