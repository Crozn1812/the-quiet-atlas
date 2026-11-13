# GFX-P2 — trả lời Lead lượt 2 (lượt cuối)

- Đồng ý thêm **một lần build** nữa.
- **Trước khi build: rebase lên main mới nhất** (`git fetch` không cần; main là repo cha: `git rebase main` sau khi commit tạm `wip` hoặc `git stash`, rồi bỏ commit tạm). Main đã có:
  - E2E-VH `42b9662`: test xe chờ frame mô phỏng thay vì thời gian thực.
  - GFX-P1 `1e83b17`: hậu kỳ/IBL C và `dressing.ts` nhường main thread khi world đang build. Hai ca xe SwiftShader của bạn nhiều khả năng do lỗi này.
  - GFX-P3 `426bc0b`: cây C.
- Giải xung đột nếu có trong `terrain/*`, `road/*` (chỉ vật liệu của bạn); không sửa file của P1/P3.
- Sau build: e2e world `--workers=2` bằng **config mặc định** 43/43 (dán output), load-budget, ảnh High 8 khu + Low First Light trên bản đã rebase, `check:assets`, gate PASS. Không commit; cập nhật handoff.

> **Lead (02:20):** sandbox không ghi được `.git` của repo chính nên Lead đã rebase hộ: worktree W-C giờ trên main `54680c7`, thay đổi của bạn vẫn chưa commit. Xung đột đã giải: `LICENSES.csv` gộp hai bên; `terrain/detail.ts` lấy bản của bạn. **Kiểm tra:** main (MAP-01) dùng `COAST_SAND_Z` từ `layout/scale.ts` để giới hạn cát theo trục z; `materials/cc0.ts` chưa dùng hằng này, phải nối vào để cát chỉ ở bờ biển. Bỏ qua bước rebase/stash, đi thẳng tới build.
