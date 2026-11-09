#!/usr/bin/env bash
# Usage: run-codex-lead.sh <card.md> [effort]
# Runs Codex as Lead on the main checkout (sandbox workspace-write; writable: repo + D:/tqa-worktrees).
# Loops until docs/runbook/lead-handoff.md contains "<CARD-ID> DONE". On a usage limit it waits until the
# reported reset time (+2 min; a past clock time means tomorrow) and continues. Max 30 runs.
set -uo pipefail
CARD="$1"; EFFORT="${2:-medium}"
REPO=D:/the-quiet-atlas
ID=$(basename "$CARD" .md | cut -d- -f1-2)
LOG=D:/tqa-worktrees/LEAD-$ID.log
for run in $(seq 1 30); do
  grep -q "$ID DONE" "$REPO/docs/runbook/lead-handoff.md" && { echo "$(date '+%F %T') $ID DONE"; exit 0; }
  echo "$(date '+%F %T') run $run"
  { cat "$REPO/docs/tickets/$CARD"; printf '\n\nLần chạy %s. Đọc docs/runbook/lead-handoff.md (mục %s đang làm) để tiếp tục, không làm lại việc đã xong.\n' "$run" "$ID"; } \
    | codex exec -m gpt-6.1-sol -c model_reasoning_effort="$EFFORT" -s workspace-write -C "$REPO" \
        --add-dir D:/tqa-worktrees -o "D:/tqa-worktrees/LEAD-$ID.last.md" --color never - > "$LOG" 2>&1
  if tail -c 4000 "$LOG" | grep -q "usage limit"; then
    when=$(grep -o "try again at [^.]*" "$LOG" | tail -1 | sed 's/try again at //; s/^\(Nov\|Dec\|Jan\) [0-9a-z]*, [0-9]* //')
    target=$(date -d "$when" +%s 2>/dev/null || echo $(( $(date +%s) + 3600 )))
    [ "$target" -lt "$(date +%s)" ] && target=$(( target + 86400 ))
    echo "$(date '+%F %T') QUOTA until $when"
    sleep $(( target - $(date +%s) + 120 ))
  fi
done
echo "$(date '+%F %T') stopped after 30 runs"
