#!/usr/bin/env bash
# Usage: dispatch.sh <TICKET-ID> <card-file-name> [effort]
# Creates D:/tqa-worktrees/<ID> on lane/<ID> from main, installs offline, runs Codex (workspace-write sandbox).
set -uo pipefail
ID="$1"; CARD="$2"; EFFORT="${3:-low}"
REPO=D:/the-quiet-atlas
WT=D:/tqa-worktrees/$ID
git -C "$REPO" worktree add -q "$WT" -b "lane/$ID" || { echo "$ID: worktree failed"; exit 1; }
(cd "$WT" && pnpm install --frozen-lockfile --offline > /dev/null 2>&1) || { echo "$ID: install failed"; exit 1; }
cat "$REPO/docs/tickets/_common-b2.md" "$REPO/docs/tickets/$CARD" \
  | codex exec -m gpt-6.1-sol -c model_reasoning_effort="$EFFORT" -s workspace-write -C "$WT" \
      -o "D:/tqa-worktrees/$ID.last.md" --color never - > "D:/tqa-worktrees/$ID.log" 2>&1
echo "$ID codex exit $?"
