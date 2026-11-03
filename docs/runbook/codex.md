# Runbook — Điều khiển Codex

Kiểm tra ngày 2026-11-03 bằng `codex exec --help` thật.

| Mục | Giá trị |
|---|---|
| Phiên bản | `codex-cli 0.166.0` |
| Đăng nhập | `codex login status` → "Logged in using ChatGPT" (Duy quản lý, không lưu credential trong repo) |

## Lệnh chuẩn cho một ticket

```powershell
Get-Content docs\tickets\<ID>.md -Raw | codex exec -s workspace-write -C ..\tqa-L1 -o ..\tqa-L1.last.md --color never -
```

- `-s workspace-write`: sandbox chỉ ghi trong thư mục làm việc. **Bắt buộc.**
- `-C <worktree>`: thư mục gốc của agent = worktree của lane.
- `-` : đọc prompt (ticket card) từ stdin.
- `-o <file>`: ghi tin nhắn cuối (bàn giao) ra file ngoài worktree để Lead đọc.
- `--json`: dùng khi cần log sự kiện JSONL.

## Cấm dùng

- `-s danger-full-access`
- `--dangerously-bypass-approvals-and-sandbox`
- `--dangerously-bypass-hook-trust`
- `--add-dir` trỏ ra ngoài worktree của lane
- `--worktree` (Lead tự tạo worktree bằng `git worktree add` để kiểm soát tên nhánh)

## Đã quan sát (L1-001, L2-001 — 2026-11-03)

- Sandbox `workspace-write` **chặn** Codex ghi vào `D:/the-quiet-atlas/.git/worktrees/<lane>/` → Codex không `git add/commit` được. Giữ nguyên như vậy (Codex không cần quyền git): Lead review diff rồi tự commit trong worktree, sau đó squash merge vào `main`. Không thêm `--add-dir` cho `.git`.
- Sandbox cũng chặn truy vấn phần cứng (CIM) — bình thường.
- Cả hai lần Codex chỉ sửa trong phạm vi ticket (Lead đã kiểm `git status`).

## Quy ước

- Mỗi ticket một worktree, **từ 2026-11-03 đặt dưới `D:/tqa-worktrees/<ticket-id>`**: `git worktree add D:/tqa-worktrees/L1-002 -b lane/L1-002`. Lý do: công cụ của Lead không được xóa thư mục ngay gốc ổ `D:\`, nên các worktree cũ `D:\tqa-L1..L3` để lại `node_modules` không dọn được (Duy tự xóa). Thư mục con trong `D:/tqa-worktrees/` dọn được sau khi merge.
- Sau `git worktree remove`, kiểm tra thư mục đã mất hẳn; nếu còn `node_modules` thì xóa thư mục con đó.
- Mọi lệnh chạy trong worktree dùng `pnpm --dir <path>` hoặc `git -C <path>`; không dựa vào `Push-Location` (nếu path sai, lệnh sẽ chạy nhầm trên `main`).
- Prompt = ticket card trong `docs/tickets/` + đường dẫn các mục spec liên quan.
- Lead tự chạy lint/typecheck/test/build và đọc diff trước khi merge; tối đa 3 vòng sửa.
