# GFX-P5 — tiếp tục (account cũ hết credit)

Làm tiếp ticket `docs/tickets/GFX-P5.card.md` (đọc lại card và phần Chung trong `GFX-PROD.md`). Lượt trước bị ngắt giữa chừng khi đang viết `assignBakedUVs` / appearance baked; mọi thay đổi chưa commit vẫn còn trong worktree này: chạy `git status` và `git diff --stat` để nắm lại, không làm lại từ đầu.

Thêm (từ E2E-VH, `42b9662`): `data-world-build="done"` không được chờ texture hay bake của nhân vật/xe; các thứ đó nạp sau khi chơi được. Ở Low giữ vật liệu đơn giản.

Điều kiện xong như card, cộng `world-vehicle.spec.ts` bằng config mặc định `--workers=1` PASS. Không commit.

> **Lead (02:45):** W-D bị khóa quyền (thư mục build do sandbox account D sở hữu → EPERM). Lead đã áp `character-finish.patch` và chuyển **toàn bộ thay đổi** sang worktree mới `D:/tqa-worktrees/W-A`, nhánh `lane/GFX-P5` dựng lại từ main mới nhất (`d51fc89`, đã có P1/P3/P6). Thay đổi chưa commit. Làm tiếp các gate còn lại ở đây: lint, typecheck, unit, build một lần, e2e world `--workers=2` config mặc định, ảnh, `check:assets`, gate.
