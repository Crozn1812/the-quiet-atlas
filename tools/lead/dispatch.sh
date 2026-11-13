#!/usr/bin/env bash
# Usage: [CODEX_HOME=…|WORKER=X] dispatch.sh <TICKET-ID> <card-file-name> [effort]
# Prepares the worker's persistent worktree D:/tqa-worktrees/W-<slot> on lane/<ID> from main (slot from CODEX_HOME,
# see worker-slot.sh; no slot → old D:/tqa-worktrees/<ID>), installs, runs Codex (workspace-write sandbox).
set -uo pipefail
ID="$1"; CARD="$2"; EFFORT="${3:-low}"
. "$(dirname "$0")/worker-slot.sh"
REPO=$TQA_REPO
WT="$(prepare_slot "$ID" | tail -1)"; [ -d "$WT" ] && [ -f "$TQA_WT_ROOT/$ID.wt" ] || { echo "$ID: worktree/slot failed"; exit 1; }
case "$CARD" in /*|?:*) CARDPATH="$CARD";; *) CARDPATH="$REPO/docs/tickets/$CARD";; esac
cat "$REPO/docs/tickets/_common-b2.md" "$CARDPATH" \
  | codex exec -m gpt-6.1-sol -c model_reasoning_effort="$EFFORT" -s workspace-write -C "$WT" \
      -o "D:/tqa-worktrees/$ID.last.md" --color never - > "D:/tqa-worktrees/$ID.log" 2>&1
echo "$ID codex exit $? ($WT)"
