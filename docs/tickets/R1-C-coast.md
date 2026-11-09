## TICKET R1-C

Làm phần **R1-C** trong `docs/tickets/R1-rollout.md` (đọc mục Chung + R1-C; R1-A đã merge; R1-B chạy song song, không sửa preset đồi). Cổng review 4503.

### Vòng 1 (Lead): rebase lên main có R1-B

R1-C đạt về hình (`docs/showcase/34-r1-toan-world/r1-c-review.webp`). Nhưng R1-B đã merge (`e755681`), và hai nhánh xung đột ở 4 file: `foliage/forest-r1.ts` (R1-B thêm tô màu cây đồi `hillR1Weight`; R1-C thêm tham số `options` cho cây biển), `scene/compose.ts` (chia cây: R1-B theo trọng số forest + hill, R1-C theo `isForestR1Tree`/`isCoastR1Tree`), `terrain/mesh.ts` (thuộc tính `hillSurface` và `coastSurface`), `tests/unit/world/terrain-mesh.test.ts`.

Việc cần làm: `git merge main` trong worktree này rồi giải xung đột, **giữ đủ cả đồi lẫn biển**. Cây biển được ưu tiên trước, sau đó forest/hill theo trọng số; giữ cả hai thuộc tính surface và hai nhánh shader; danh sách thuộc tính trong test gồm `coastSurface`, `color`, `forestSurface`, `hillSurface`, `normal`, `position`. Sau đó chạy gate, `TQA_QUALITY=high ingame-shots` đủ 8 khu (kiểm Old Trail/Horizon vẫn là cây đồi R1) và e2e world (2 worker).
