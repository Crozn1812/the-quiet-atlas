## TICKET HR-ROOTS-TREE — Cây cổ thụ Roots siêu thực (đọc HR-common.md trước)

- Lane / milestone: L3 World / B3 hyper-real.
- Bối cảnh: sau HR-TREE2 và HR-ROOTS-SIGN, cây cổ thụ trung tâm khu Roots (cây "elf" phía sau bảng kỹ năng) vẫn là **khối thân xanh xám nhạt phẳng, đa giác to**, rễ là **dải xanh lá phẳng như nhựa** nằm trên mặt đất (xem `D:/tqa-worktrees/W-B/test-results/hr-roots-sign/return1/final-high/five-high.png`). Đây là vật nổi bật nhất khu Roots và lệch hẳn so với rừng HR mới.
- Việc: làm lại cây này thành **cây đa/si cổ thụ** thật: thân to nhiều múi, vỏ sần (texture vỏ CC0 Poly Haven + normal/AO, triplanar nếu cần), **rễ phụ buông từ cành** xuống đất, **rễ bạnh nổi** uốn trên mặt đất phủ rêu, lá xanh đậm theo kho HR-TREE1 (dùng lại texture/lá đã có trong `public/world/lib/hr-*`), dây leo, dương xỉ bám thân. Tạo trong Blender (CLI) hoặc geometry trong code; GLB meshopt + KTX2, LOD0/LOD1, nạp deferred; Low giữ bản rẻ nhưng cùng màu sắc.
- Giữ: vị trí, collider, chỗ đặt bảng kỹ năng và điểm tương tác, mọi nội dung Roots; không che bảng.
- Được sửa: `src/features/world/zones/roots.ts`, `roots-dressing.ts` (chỉ phần cây), file mới `zones/roots-tree*.ts`, `public/world/roots/`, `tools/assets/blender/roots-tree*`, `assets/LICENSES.csv`, test. Không sửa `roots-sign.ts`, `foliage/**` (PERF-HR đang làm).
- Xong: gate PASS; build 1 lần **sau** thay đổi cuối; e2e world `--workers=2` 43/43 trên build đó; ảnh High trước/sau cùng góc (đứng trước bảng 5 m, và toàn cây 15 m) + Low; bảng tam giác/draw/byte/FPS High trên RTX 3060. Không commit.
