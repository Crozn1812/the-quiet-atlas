#!/usr/bin/env bash
# Usage: dispatch-agy.sh <TICKET-ID> <card-file-name> [effort]
# Same contract as dispatch.sh, for the Antigravity CLI: worktree D:/tqa-worktrees/<ID> on lane/<ID>,
# log D:/tqa-worktrees/<ID>.log, final answer D:/tqa-worktrees/<ID>.last.md (so wait-any.sh/merge.sh work unchanged).
# Uses the persistent slot W-AGY (worker-slot.sh). Re-running a dispatched ticket continues it (like resume.sh).
set -uo pipefail
ID="$1"; CARD="$2"; EFFORT="${3:-medium}"
# Argon has its own weekly quota (out until ~19/11); Hydrogen is the default worker model. Override: AGY_MODEL=…
AGY_MODEL="${AGY_MODEL:-gemini-4-hydrogen-high}"
# A model name ending in -low/-medium/-high already fixes the effort; agy rejects an extra --effort (2026-11-13).
case "$AGY_MODEL" in *-low|*-medium|*-high) EFFORT_ARG="";; *) EFFORT_ARG="--effort $EFFORT";; esac
REPO=D:/the-quiet-atlas
. "$(dirname "$0")/worker-slot.sh"
case "$CARD" in /*|?:*) CARDPATH="$CARD";; *) CARDPATH="$REPO/docs/tickets/$CARD";; esac
if [ -f "$TQA_WT_ROOT/$ID.wt" ]; then WT="$(wt_for "$ID")"   # continue an existing ticket
else WORKER="${WORKER:-AGY}" WT="$(prepare_slot "$ID" | tail -1)"; [ -d "$WT" ] || { echo "$ID: slot failed"; exit 1; }
fi
PROMPT="$(cat "$REPO/docs/tickets/_common-b2.md" "$CARDPATH")

## Cách làm
Làm việc trong thư mục hiện tại ($WT), không sửa ngoài nó. Không commit, không push, không chạm cloud/credential.
Blender MCP của bạn ở cổng 9879 (đã cấu hình). Xong thì in bàn giao: file đã sửa, lệnh đã chạy + exit code, việc chưa làm."
cd "$WT" && agy -p "$PROMPT" --model "$AGY_MODEL" --mode auto --sandbox --settings "$TQA_REPO/tools/lead/agy-settings.json" $EFFORT_ARG --print-timeout 0 \
  > "D:/tqa-worktrees/$ID.log" 2>&1
code=$?
tail -c 6000 "D:/tqa-worktrees/$ID.log" > "D:/tqa-worktrees/$ID.last.md"
echo "$ID agy exit $code"
