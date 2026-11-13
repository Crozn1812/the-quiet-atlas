# Lead: điều khiển worker (từ 2026-11-13)

Duy chuẩn bị nhiều tài khoản Codex và một Antigravity CLI. Claude là Lead; worker chỉ làm ticket trong worktree riêng. Lead chạy chúng bằng lệnh nền, **không gõ vào các cửa sổ Codex "YOLO mode"** Duy mở sẵn (chế độ đó tắt sandbox, trái CLAUDE.md §4).

## Worker

| Worker | Cách gọi | Blender MCP |
|---|---|---|
| Codex A | `CODEX_HOME=C:/Users/PC-LP/.codex bash tools/lead/dispatch.sh <ID> <card> [effort]` | cổng 9876 |
| Codex B | `CODEX_HOME=C:/Users/PC-LP/.codex2 …` | cổng 9877 |
| Codex C | `CODEX_HOME=C:/Users/PC-LP/.codex3 …` | cổng 9878 |
| Codex D, E | `.codex4`, `.codex5`: **chưa đăng nhập** (chưa có `auth.json`) | — |
| Antigravity | `cd D:/tqa-worktrees/<ID> && agy -p "<prompt>" --mode accept-edits --sandbox` (xem `agy --help`) | cổng 9879 (`agy mcp list`) |

- `dispatch.sh`, `resume.sh`, `autoresume.sh` kế thừa `CODEX_HOME` từ môi trường, nên chỉ cần đặt biến trước lệnh.
- Mỗi Codex chạy `codex exec -s workspace-write` (sandbox ghi trong worktree, không mạng). Asset ngoài (Poly Haven CC0) do Lead tải qua Blender MCP của Lead hoặc worker gọi `import_asset` qua MCP của mình.
- Hết lượt một tài khoản: chuyển ticket sang tài khoản khác hoặc Antigravity (Duy 2026-11-13: "Khi codex hết usage cứ dùng anti tiếp tục làm việc"). Hai tài khoản có quyền **reset usage**; Lead được dùng khi weekly còn dưới 10 %.

## Blender cho từng worker

`bash tools/lead/blender-workers.sh` mở một Blender GUI cho mỗi cổng 9876–9879 (script `tools/lead/blender-mcp-start.py` bật add-on, đặt cổng, bật Poly Haven, khởi động server). Kiểm tra: `netstat -ano | grep 98(76|77|78|79)`. Mỗi worker chỉ dùng Blender của cổng mình, nên hai worker không sửa chung một scene.

## Main dùng chung

Hai phiên Lead từng dùng chung `D:/the-quiet-atlas`. Commit trên main luôn kèm đường dẫn: `git commit -m … -- <paths>`; không `git add -A`/`commit -a`. `merge.sh` chỉ chạy khi main sạch.
