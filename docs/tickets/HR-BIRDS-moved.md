## HR-BIRDS — chuyển từ Codex D (hết credit) sang worker này (Lead)

Codex D hết credit giữa vòng 2. Lead đã rebase phần việc lên main mới nhất (có HR-STREAMBED, HR-TREE2: cây mới, chim nên đậu trên cành của rừng HR) và áp dụng vào worktree này dưới dạng **thay đổi chưa commit**. `git status` / `git diff` để xem phần đã có (fauna/birds, flight, geometry; audio/birds, ambience, mix; index.ts đã nối).

Việc: làm tiếp **vòng trả lại 1** dưới đây cho tới điều kiện xong. Không làm lại phần đã xong. Không commit.

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

## HR-BIRDS — Chim bay và hót
Đàn chim nhỏ bay lượn trên tán (đập cánh, lượn, đổi hướng), vài con **đậu trên cành rồi bay đi** khi người chơi lại gần; chim biển (hải âu) ở bờ biển. Âm: **tiếng chim hót** theo không gian (gắn vị trí, to dần khi lại gần cây có chim), nhiều loài, ngẫu nhiên; buổi chiều thưa hơn. Âm CC0 (Freesound CC0, ghi URL) hoặc tổng hợp; tôn trọng tắt tiếng; không phát trước tương tác.
Được sửa: file mới `src/features/world/fauna/**`, `src/features/audio/**` (kênh `birds`), `public/audio/birds/`, LICENSES, test; nối `index.ts` ≤ 5 dòng.

## HR-BIRDS — trả lại vòng 1 (Lead)

Lead đã rebase W-D lên main mới nhất. Phần kỹ thuật tốt (gate, e2e 43/43, nối index.ts gọn, hải âu xa nhìn ổn). Chưa đạt thước đo siêu thực (HR-common.md), đặc biệt Duy muốn **nghe chim hót thật**:

1. **Âm thanh**: oscillator tổng hợp 3 kiểu sẽ nghe như đồ chơi điện tử. Thay bằng **bản thu chim hót thật CC0** (Freesound, chỉ file có license "Creative Commons 0"; ghi URL, tác giả, license từng file vào `assets/LICENSES.csv`). KHÔNG dùng xeno-canto (đa số CC BY-NC) hay file không ghi license. Ít nhất 5 loài rừng nhiệt đới/chim sẻ/chích chòe/cu gáy + tiếng hải âu, sóng không tính. Cắt thành đoạn ngắn 1–4 s, OGG/Opus mono ~48–64 kbps vào `public/audio/birds/`, nạp **sau** Enter World (deferred), phát ngẫu nhiên theo vị trí cây (PannerNode/HRTF), buổi chiều thưa hơn. Giữ tắt tiếng/không phát trước tương tác. Nếu không tải được file CC0 trong sandbox (mạng chặn) thì ghi BLOCKED rõ và giữ tổng hợp làm fallback — không bịa nguồn.
2. **Chim đậu cận cảnh** (ảnh perch-detail) là khối tròn thô. Làm mô hình chim nhỏ có hình dáng thật (mỏ, đầu, đuôi, cánh gấp, chân), 2–3 bộ màu loài khác nhau, texture/vertex color có vằn lông; đập cánh khi bay bằng shader/bone. Có thể tạo trong Blender (CLI) hoặc model CC0 (Quaternius/Poly Pizza CC0, ghi license).
3. Chim đậu phải nhìn thấy được trên cành cây ở khoảng cách chơi bình thường (không chỉ cận cực gần).

Build 1 lần cuối. Xong: gate, e2e world 43/43, ảnh trước/sau High + cận chim đậu + Low, danh sách file âm thanh kèm URL CC0. Không commit.
