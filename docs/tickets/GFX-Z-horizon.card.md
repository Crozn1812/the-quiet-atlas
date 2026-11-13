## GFX-Z* — Dressing từng khu hướng C (mỗi khu một ticket)
Chung: dùng hệ đã merge (P1 post/IBL, P3 cây, P4 nước; P2 vật liệu khi đã merge) và kho `public/world/lib` (đá boulder 1–4, dương xỉ, bụi, cỏ, khúc gỗ đổ, cây). Làm khu trông như ảnh thật chụp tại chỗ theo `docs/art-bible/taste.md` và nội dung khu trong spec: nhóm đá có chủ đích, bụi/dương xỉ ở mép đường và gốc cây, cỏ cao theo vùng sáng, khúc gỗ đổ, vật thể đặc trưng khu đổi sang PBR. Giữ nguyên vị trí điểm tương tác, collider đường đi, trigger, nội dung chữ.
- **CPU:** đo đơn của GFX-P6 cho thấy First Light/Workshop đã cao hơn bản cũ ~+20 ms/s. Mọi vật dressing phải **instanced/batched** (`props/batched.ts`), không thêm object có update mỗi frame, cull theo khoảng cách; báo số draw call và tam giác trước/sau.
- Asset mới (nếu có) CC0, deferred, có dòng LICENSES; ghi byte thêm.
- Được sửa: `src/features/world/zones/<khu>.ts`, file mới `src/features/world/zones/<khu>-dressing.ts`, `src/features/world/props/**` chỉ thêm file mới (không sửa file chung trừ khi ghi rõ lý do), test của khu.
- Không sửa: `index.ts`, `layout/`, `terrain/`, `materials/`, `road/`, `foliage/`, `water/`, khu khác.
- Xong: gate PASS; build một lần; e2e world `--workers=2` config mặc định; ảnh High 3 góc của khu (trước/sau) + Low 1 góc; `check:assets`. Không commit.

## Ticket này: GFX-Z-horizon — khu `horizon`
P2 (vật liệu ảnh) đã merge `5258866`: dùng `materials/cc0.ts` cho vật thể mới nếu cần, không sửa nó.

Chung cho mọi ticket GFX-P*:
- Áp `_common-b2.md`, `_graphics-common.md`; đọc `docs/adr/0018-graphics-direction-c.md`, `docs/art-bible/taste.md`.
- Nguồn tham khảo đã có: bàn dựng `tools/styleframes/` (GFX-01: `createPost`, preset C, đo chi phí) trong nhánh `lane/GFX-01`; kho cây/đá `lane/GFX-02`. Lead merge hai nhánh này trước khi giao.
- Texture/HDRI/mô hình **CC0 thật** qua Blender MCP của bạn (Poly Haven) hoặc ambientCG; mỗi file một dòng `assets/LICENSES.csv`; KTX2 High 2K / Balanced 1K / Low 512; nạp **deferred** sau khi chơi được.
