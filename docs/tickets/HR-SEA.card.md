# Đợt siêu thực (HR) — phần chung cho mọi ticket HR-*

Duy chấm đồ họa main `c8531eb` **4/10**: "vẫn ở mức khung, chưa đủ thật… đồ họa quá tệ, cần cải thiện rất rất nhiều". Mục tiêu đợt này: **siêu thực** (photoreal) trong giới hạn web, giữ concept (suối là trục, bình minh → hoàng hôn, 8 khu, nội dung thật).

Thước đo "đạt": đặt ảnh High cạnh một ảnh chụp thật cùng loại cảnh (rừng nhiệt đới Việt Nam, suối đá, bờ biển), người xem phải mất vài giây mới phân biệt. Không còn: đa giác phẳng to nhìn thấy được, cạnh răng cưa, vật lặp y hệt cạnh nhau, màu phẳng không có chi tiết, mép cắt thẳng.

Luật bắt buộc (CLAUDE.md §6, ADR 0018):
- Asset **CC0** thật (Poly Haven, ambientCG, Quaternius CC0, Freesound CC0) hoặc tự tạo trong Blender (MCP của bạn: Sapling Tree Gen, Ivy Gen, geometry nodes, bake normal/AO). Mỗi file public một dòng `assets/LICENSES.csv` kèm URL nguồn. Không asset giấy phép không rõ, không AI-gen không rõ điều khoản.
- KTX2 (High 2K / Balanced 1K / Low 512), GLB meshopt; **nạp deferred** sau khi chơi được; thời gian tới lúc chơi được ≤ 10 s.
- **Tổng world hiện vẫn ≤ 30 MB** (ADR 0015) cho tới khi Duy duyệt trần mới (Q-48). Ghi byte thêm của ticket.
- Low giữ T08 Iris Xe: Low là đường rẻ (ít instance, không hiệu ứng đắt). Mọi chuyển động trong shader, cull theo khoảng cách, instancing. CPU ABBA ≤ +10 ms/s mỗi ticket.
- Không sửa `src/content/**`; không bịa nội dung; không logo/thương hiệu.
- Sandbox không ghi được `.git` của repo chính: không rebase/commit.
- Xong: gate PASS; build một lần; e2e world `--workers=2` config mặc định 43/43; ảnh **trước/sau** High cùng góc (dùng `tools/review/final-showcase.mjs` hoặc `ingame-shots.mjs`) + Low 1; bảng tam giác/draw/byte/CPU. Không commit.

## HR-SEA — Biển Last Postcard/Quiet Shore có ánh sáng (lỗi 5)
Biển hiện tối đặc ở góc cao. Hoàng hôn: **vệt nắng vàng trên mặt biển** (specular sun glitter), màu nước theo độ sâu (gần bờ xanh ngọc trong, xa xanh đậm), phản chiếu trời, sóng nhỏ normal map nhiều tần số, sương biển chân trời. Giữ sóng vỗ SURF-01.
Được sửa: `src/features/world/water/sea.ts`, `water/surface.ts` (phần biển), `shore/**` (vật liệu), test.

