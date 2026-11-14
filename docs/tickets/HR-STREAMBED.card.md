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

## HR-STREAMBED — Lòng suối: đá sỏi, rêu, rong
Lòng suối và mép suối: **sỏi** nhiều cỡ (instanced, texture CC0) dưới nước nhìn thấy được, **đá tảng** nhô lên mặt nước có **rêu** xanh ở phần ẩm, **rong** dưới nước lay theo dòng (shader), lá rụng trôi chậm, bọt quanh đá. Bám `water/depth.ts`, không chắn lội suối/cầu/cá.
Được sửa: file mới `src/features/world/water/streambed*.ts`, `public/world/streambed/`, LICENSES, test; nối `index.ts` ≤ 5 dòng. Không sửa `water/ribbon.ts`, `water/material.ts` (STREAM-C).

