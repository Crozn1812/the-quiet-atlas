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

## HR-TREE2 — Rừng không cây nào giống nhau (runtime, sau HR-TREE1)
Thay cây trong rừng/đồi bằng kho HR-TREE1: chọn biến thể theo sinh cảnh (ven suối, sườn đồi, rừng sâu, bìa rừng), xoay/tỉ lệ/nghiêng/màu lá ngẫu nhiên theo seed, **không hai cây giống nhau đứng gần**; tầng dưới tán: dương xỉ, bụi, cây con, gỗ mục; dây leo rủ từ cành. Gió lay theo tầng (thân/cành/lá) trong shader. Giữ collider, tán kín trời FL-03, cây elf Roots.
Được sửa: `src/features/world/foliage/**`, test.


### Ghi chú Lead sau review HR-TREE1 (af5795c)
Kho 12 cây đã vào main (`public/world/lib/hr-tree-*`, snippet nối ở `tools/assets/blender/hr-trees-HANDOFF.md`). Lead thấy còn thiếu, xử lý ở runtime trong ticket này:
- Lá **một màu xanh đậm phẳng** trên mọi cây → biến thiên màu lá theo cây/cụm (vàng-xanh non, xanh xám, lá úa lác đác), translucency khi ngược sáng, AO trong tán.
- Dây leo khó thấy ở khoảng cách chơi → thêm dây leo rủ (vine strands) từ cành, đủ nhìn rõ trong ảnh High.
- Tre (bamboo-*) giống bụi cây tròn → nếu không sửa được trong runtime thì ghi rõ, Lead mở HR-TREE1b.
Ảnh cận + trung + xa cho ít nhất 4 khu có rừng.
