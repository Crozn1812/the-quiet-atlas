#!/usr/bin/env bash
# Usage: dispatch-agy.sh <TICKET-ID> <card-file-name> [effort]
# Same contract as dispatch.sh, for the Antigravity CLI: worktree D:/tqa-worktrees/<ID> on lane/<ID>,
# log D:/tqa-worktrees/<ID>.log, final answer D:/tqa-worktrees/<ID>.last.md (so wait-any.sh/merge.sh work unchanged).
# Re-running on an existing worktree continues the work (like resume.sh).
set -uo pipefail
ID="$1"; CARD="$2"; EFFORT="${3:-medium}"
REPO=D:/the-quiet-atlas; WT=D:/tqa-worktrees/$ID
case "$CARD" in /*|?:*) CARDPATH="$CARD";; *) CARDPATH="$REPO/docs/tickets/$CARD";; esac
if [ ! -d "$WT" ]; then
  git -C "$REPO" worktree add -q "$WT" -b "lane/$ID" || { echo "$ID: worktree failed"; exit 1; }
  (cd "$WT" && { pnpm install --frozen-lockfile --offline > /dev/null 2>&1 || pnpm install --frozen-lockfile > /dev/null 2>&1; }) \
    || { echo "$ID: install failed"; exit 1; }
fi
PROMPT="$(cat "$REPO/docs/tickets/_common-b2.md" "$CARDPATH")

## Cách làm
Làm việc trong thư mục hiện tại ($WT), không sửa ngoài nó. Không commit, không push, không chạm cloud/credential.
Blender MCP của bạn ở cổng 9879 (đã cấu hình). Xong thì in bàn giao: file đã sửa, lệnh đã chạy + exit code, việc chưa làm."
cd "$WT" && agy -p "$PROMPT" --mode accept-edits --sandbox --effort "$EFFORT" --print-timeout 0 \
  > "D:/tqa-worktrees/$ID.log" 2>&1
code=$?
tail -c 6000 "D:/tqa-worktrees/$ID.log" > "D:/tqa-worktrees/$ID.last.md"
echo "$ID agy exit $code"
