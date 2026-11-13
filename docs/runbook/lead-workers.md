# Lead: điều khiển worker (từ 2026-11-13)

Duy chuẩn bị nhiều tài khoản Codex và một Antigravity CLI. Claude là Lead; worker chỉ làm ticket trong worktree riêng. Lead chạy chúng bằng lệnh nền, **không gõ vào các cửa sổ Codex "YOLO mode"** Duy mở sẵn (chế độ đó tắt sandbox, trái CLAUDE.md §4).

## Worker

| Worker | Cách gọi | Blender MCP |
|---|---|---|
| Codex A | `CODEX_HOME=C:/Users/PC-LP/.codex bash tools/lead/dispatch.sh <ID> <card> [effort]` | cổng 9876 |
| Codex B | `CODEX_HOME=C:/Users/PC-LP/.codex2 …` | cổng 9877 |
| Codex C | `CODEX_HOME=C:/Users/PC-LP/.codex3 …` | cổng 9878 |
| Codex D | `CODEX_HOME=C:/Users/PC-LP/.codex4 …` (đăng nhập 13/11 20:00) | cổng 9880 |
| Codex E | `.codex5`: **chưa đăng nhập** | — |
| Antigravity | `bash tools/lead/dispatch-agy.sh <ID> <card> [effort]` — model mặc định **gemini-4-hydrogen-high** (Argon hết quota tới ~19/11; đổi bằng `AGY_MODEL=…`), quyền lệnh/MCP theo `tools/lead/agy-settings.json` (chế độ headless không hỏi được, lệnh ngoài danh sách bị từ chối và agy dừng → thêm vào danh sách, không dùng `--dangerously-skip-permissions`) | cổng 9879 (`agy mcp list`) |

- `dispatch.sh`, `resume.sh`, `autoresume.sh` kế thừa `CODEX_HOME` từ môi trường, nên chỉ cần đặt biến trước lệnh.
- Mỗi Codex chạy `codex exec -s workspace-write` (sandbox ghi trong worktree, không mạng). Asset ngoài (Poly Haven CC0) do Lead tải qua Blender MCP của Lead hoặc worker gọi `import_asset` qua MCP của mình.
- Hết lượt một tài khoản: chuyển ticket sang tài khoản khác hoặc Antigravity (Duy 2026-11-13: "Khi codex hết usage cứ dùng anti tiếp tục làm việc"). Hai tài khoản có quyền **reset usage**; Lead được dùng khi weekly còn dưới 10 %.

## Blender cho từng worker

`bash tools/lead/blender-workers.sh` mở một Blender GUI cho mỗi cổng 9876–9879 (script `tools/lead/blender-mcp-start.py` bật add-on, đặt cổng, bật Poly Haven, khởi động server). Kiểm tra: `netstat -ano | grep 98(76|77|78|79)`. Mỗi worker chỉ dùng Blender của cổng mình, nên hai worker không sửa chung một scene.

## Main dùng chung

Hai phiên Lead từng dùng chung `D:/the-quiet-atlas`. Commit trên main luôn kèm đường dẫn: `git commit -m … -- <paths>`; không `git add -A`/`commit -a`. `merge.sh` chỉ chạy khi main sạch.

## Thư mục cố định cho từng worker (từ 2026-11-13, Duy chọn "cách 1")

Mỗi worker giữ **một** worktree cố định: `D:/tqa-worktrees/W-A` (`.codex`), `W-B` (`.codex2`), `W-C` (`.codex3`), `W-D` (`.codex4`), `W-E` (`.codex5`), `W-AGY` (Antigravity). Mỗi ticket mới chỉ đổi nhánh (`lane/<ID>` từ main), không tạo thư mục mới. Nhờ vậy sandbox Windows của Codex chỉ xin quyền admin một lần cho mỗi worker, thay vì mỗi ticket.

- `dispatch.sh` tự suy ra worker từ `CODEX_HOME`; có thể ép bằng `WORKER=X`. `dispatch-agy.sh` dùng `W-AGY`.
- `D:/tqa-worktrees/<ID>.wt` ghi thư mục của ticket; `resume.sh` và `merge.sh` đọc file này.
- `W-<x>.busy` chứa ID ticket đang chiếm worker. Dispatch vào worker đang bận sẽ bị **từ chối**.
- `merge.sh` xong thì giải phóng worker (detach về main, xóa nhánh, xóa `.busy`), giữ nguyên thư mục.
- Bỏ một ticket: `. tools/lead/worker-slot.sh; release_ticket <ID>`, sau khi worktree đã sạch hoặc đã commit wip.
- Ticket tạo theo kiểu cũ (`D:/tqa-worktrees/<ID>`) vẫn chạy và merge như trước.

## Sandbox Windows: giữ elevated (2026-11-13 tối)

Đã thử `[windows] sandbox = "unelevated"` để hết hộp thoại admin: hết hộp thoại nhưng trong sandbox build, Edge và bash hỏng (`spawn EPERM`, `CreateFileMapping` Win32 error 5), worker không kiểm được gì. **Đã quay lại `elevated`.** Giảm hộp thoại bằng thư mục cố định W-x: mỗi thư mục chỉ hỏi một lần. Mỗi tài khoản cần thêm `[projects.'D:\'] trust_level = "trusted"`; thiếu dòng này Codex hạ xuống read-only.

- Codex sandbox không ghi được `.git/worktrees/*` của repo chính (index.lock Permission denied): **không giao "rebase" cho worker**. Lead tự rebase: `git add -A; git commit -m wip; git rebase main; git reset --soft HEAD~1; git reset`, rồi resume.
