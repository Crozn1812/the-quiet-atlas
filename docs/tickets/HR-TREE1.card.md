# Đợt siêu thực (HR) — phần chung cho mọi ticket HR-*

Duy chấm đồ họa main `c8531eb` **4/10**: "vẫn ở mức khung, chưa đủ thật… đồ họa quá tệ, cần cải thiện rất rất nhiều". Mục tiêu đợt này: **siêu thực** (photoreal) trong giới hạn web, giữ concept (suối là trục, bình minh → hoàng hôn, 8 khu, nội dung thật).

Thước đo "đạt": đặt ảnh High cạnh một ảnh chụp thật cùng loại cảnh (rừng nhiệt đới Việt Nam, suối đá, bờ biển), người xem phải mất vài giây mới phân biệt. Không còn: đa giác phẳng to nhìn thấy được, cạnh răng cưa, vật lặp y hệt cạnh nhau, màu phẳng không có chi tiết, mép cắt thẳng.

Luật bắt buộc (CLAUDE.md §6, ADR 0018):
- Asset **CC0** thật (Poly Haven, ambientCG, Quaternius CC0, Freesound CC0) hoặc tự tạo trong Blender (MCP của bạn: Sapling Tree Gen, Ivy Gen, geometry nodes, bake normal/AO). Mỗi file public một dòng `assets/LICENSES.csv` kèm URL nguồn. Không asset giấy phép không rõ, không AI-gen không rõ điều khoản.
- **Không còn trần** (Duy 14/11, ADR 0019): dùng texture 4K/2K, mô hình chi tiết, mật độ cao tùy chất lượng cần. Vẫn nạp **deferred/streaming** sau khi chơi được để trang mở nhanh; GLB meshopt + KTX2.
- **Ghi lại** (không chặn): byte thêm, thời gian tới lúc chơi được, tam giác, draw call, CPU ABBA, FPS.
- Vẫn có đường Low rẻ cho máy yếu. Thực hành tốt: chuyển động trong shader, instancing, LOD, cull theo khoảng cách (để đẹp mà vẫn mượt, không phải vì trần).
- Không sửa `src/content/**`; không bịa nội dung; không logo/thương hiệu.
- Sandbox không ghi được `.git` của repo chính: không rebase/commit.
- Xong: gate PASS; build một lần; e2e world `--workers=2` config mặc định 43/43; ảnh **trước/sau** High cùng góc (dùng `tools/review/final-showcase.mjs` hoặc `ingame-shots.mjs`) + Low 1; bảng tam giác/draw/byte/CPU. Không commit.

## HR-TREE1 — Kho cây siêu thực đa dạng (asset)
Tạo trong Blender (Sapling Tree Gen / geometry nodes) + texture vỏ/lá CC0: **≥ 12 cây khác nhau** cho rừng nhiệt đới Việt Nam (cây gỗ lớn có bạnh rễ, cây tán rộng, cây thân mảnh, tre/trúc bụi, cây đổ nghiêng, cây chết khô), **cành chằng chịt** nhiều cấp, **dây leo quấn quanh thân/cành** (Ivy Gen) ở ít nhất 5 cây, rêu ở gốc. Lá: alpha-cutout cụm lá thật (texture lá CC0), 2 mặt, translucency. Mỗi cây LOD0/LOD1/impostor. Ghi tam giác, byte từng cây.
Được sửa: `tools/assets/blender/hr-trees*`, `public/world/lib/hr-*`, `public/world/lib/manifest.json` (chỉ thêm), LICENSES, test manifest. Không sửa `src/features/world/foliage/**` (HR-TREE2).

