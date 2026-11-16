#!/usr/bin/env bash
# Usage: CODEX_HOME=… move-patch.sh <TICKET-ID> <full-card> <moved-note> <patch-file> [effort]
# Prepares the account's slot on lane/<ID> from main, applies the carried patch, and runs Codex on card + note.
set -uo pipefail
ID="$1"; CARD="$2"; NOTE="$3"; PATCH="$4"; EFFORT="${5:-high}"
cd D:/the-quiet-atlas
. tools/lead/worker-slot.sh
WT="$(prepare_slot "$ID" | tail -1)" || { echo "$ID: prepare_slot failed"; exit 1; }
git -C "$WT" apply --binary "$PATCH" || { echo "$ID: patch failed"; exit 1; }
echo "$ID carried into $WT: $(git -C "$WT" status --short | wc -l) files"
cat docs/tickets/_common-b2.md "docs/tickets/$CARD" "docs/tickets/$NOTE" \
  | codex exec -m gpt-6.1-sol -c model_reasoning_effort="$EFFORT" -s workspace-write -C "$WT" \
      -o "D:/tqa-worktrees/$ID.last.md" --color never - > "D:/tqa-worktrees/$ID.log" 2>&1
echo "$ID codex exit $?"
