#!/usr/bin/env bash
# Usage: merge.sh <TICKET-ID> <commit-message-file>
# Squash-merges lane/<ID> into main's working tree, runs the strict gate (no pipes), commits only on PASS,
# then removes the worktree and branch. On conflict or gate failure it stops and leaves main uncommitted.
set -uo pipefail
ID="$1"; MSG="$2"
REPO=D:/the-quiet-atlas
. "$(dirname "$0")/worker-slot.sh"; WT="$(wt_for "$ID")"
GATE="$REPO/tools/lead/gate.sh"
if [ -n "$(git -C "$WT" status --porcelain)" ]; then
  git -C "$WT" add -A && git -C "$WT" commit -q -m "wip $ID" || { echo "$ID: wip commit failed"; exit 1; }
fi
if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]; then echo "$ID: main working tree not clean"; exit 1; fi
git -C "$REPO" merge --squash "lane/$ID" > /dev/null 2>&1 || { echo "$ID: MERGE CONFLICT"; git -C "$REPO" status --short | grep -E "^(UU|AA|DU|UD)"; exit 1; }
bash "$GATE" "$REPO" || { echo "$ID: GATE FAILED (main left uncommitted)"; exit 1; }
git -C "$REPO" commit -q -F "$MSG" || { echo "$ID: commit failed"; exit 1; }
release_ticket "$ID"
echo "$ID MERGED $(git -C "$REPO" log --oneline -1)"
