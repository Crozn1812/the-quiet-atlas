#!/usr/bin/env bash
# Usage: resume2.sh <ID> <card> — run Codex on an existing worktree (resumed or prepared by Lead), card read from main.
set -uo pipefail
ID="$1"; CARD="$2"; REPO=D:/the-quiet-atlas; WT=D:/tqa-worktrees/$ID
{ cat "$REPO/docs/tickets/_common-b2.md" "$REPO/docs/tickets/$CARD"; printf '\n\n## TIẾP TỤC\nWorktree này đã có sẵn phần việc (xem `git status`/`git diff`). Đọc lại, làm tiếp cho xong ticket, chạy đủ điều kiện xong (exit 0 cả ba lệnh) và viết bàn giao.\nCác file thẻ tham chiếu nằm ở D:/the-quiet-atlas/docs/tickets/ nếu worktree chưa có.\n'; } \
  | codex exec -m gpt-6.1-sol -c model_reasoning_effort=low -s workspace-write -C "$WT" \
      -o "D:/tqa-worktrees/$ID.last.md" --color never - > "D:/tqa-worktrees/$ID.resume.log" 2>&1
echo "$ID codex exit $?"
