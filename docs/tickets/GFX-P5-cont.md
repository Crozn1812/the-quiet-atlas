# GFX-P5 — tiếp tục (account cũ hết credit)

Làm tiếp ticket `docs/tickets/GFX-P5.card.md` (đọc lại card và phần Chung trong `GFX-PROD.md`). Lượt trước bị ngắt giữa chừng khi đang viết `assignBakedUVs` / appearance baked; mọi thay đổi chưa commit vẫn còn trong worktree này: chạy `git status` và `git diff --stat` để nắm lại, không làm lại từ đầu.

Thêm (từ E2E-VH, `42b9662`): `data-world-build="done"` không được chờ texture hay bake của nhân vật/xe; các thứ đó nạp sau khi chơi được. Ở Low giữ vật liệu đơn giản.

Điều kiện xong như card, cộng `world-vehicle.spec.ts` bằng config mặc định `--workers=1` PASS. Không commit.
