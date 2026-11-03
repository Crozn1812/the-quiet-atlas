# Runbook — Công cụ local

Đã cài ngày 2026-11-03 (Lead chạy, Duy cho phép):

| Công cụ | Phiên bản | Cách cài |
|---|---|---|
| git | 2.56.0.windows.4 | `winget install --id Git.Git -e` |
| node | v26.13.0 | `winget install --id OpenJS.NodeJS.LTS -e` |
| npm | 11.20.0 | đi kèm Node |
| pnpm | 12.16.1 | `npm install -g pnpm` (Node 26 không còn kèm corepack) |
| codex | 0.166.0 | `npm install -g @openai/codex` |

Terminal mở trước khi cài cần mở lại (hoặc nạp lại PATH) mới thấy lệnh.

## Kiểm tra

```powershell
git --version; node --version; pnpm --version; codex --version
```

## Cấu hình git

Tên/email gắn vào commit của repo public — Duy chọn:

```powershell
git config --global user.name "<tên>"
git config --global user.email "<email>"
```
