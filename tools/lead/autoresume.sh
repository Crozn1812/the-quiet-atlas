#!/usr/bin/env bash
# Usage: autoresume.sh <ID:card.md> [<ID:card.md> ...]
# Watches running Codex tickets (resume.sh / dispatch.sh). A ticket is done when its .last.md is newer than the
# start of this script and its log has stopped growing. If its log reports a usage limit, waits until the
# "try again at …" time (+2 min) and resumes it with tools/lead/resume.sh. Never inspects codex.exe processes
# (other Codex apps may run on the machine). Exits when every ticket is done; prints one line per event.
set -uo pipefail
REPO=D:/the-quiet-atlas
start=$(date +%s)
declare -A pending
for item in "$@"; do pending[${item%%:*}]=${item#*:}; done
log_of() { if [ -f "D:/tqa-worktrees/$1.resume.log" ] && [ "$(date -r "D:/tqa-worktrees/$1.resume.log" +%s)" -ge "$start" ]; then echo "D:/tqa-worktrees/$1.resume.log"; else echo "D:/tqa-worktrees/$1.log"; fi; }
while [ ${#pending[@]} -gt 0 ]; do
  sleep 60
  for id in "${!pending[@]}"; do
    log=$(log_of "$id")
    age=$(( $(date +%s) - $(date -r "$log" +%s) ))
    [ "$age" -lt 90 ] && continue  # still writing
    if [ -f "D:/tqa-worktrees/$id.last.md" ] && [ "$(date -r "D:/tqa-worktrees/$id.last.md" +%s)" -gt "$start" ] \
       && ! tail -c 2000 "$log" | grep -q "usage limit"; then
      echo "$(date '+%F %T') $id DONE"; unset "pending[$id]"; continue
    fi
    if tail -c 4000 "$log" | grep -q "usage limit"; then
      when=$(grep -o "try again at [^.]*" "$log" | tail -1 | sed 's/try again at //; s/^\(Nov\|Dec\|Jan\) [0-9a-z]*, [0-9]* //')
      target=$(date -d "$when" +%s 2>/dev/null || echo $(( $(date +%s) + 3600 )))
      [ "$target" -lt "$(date +%s)" ] && target=$(date +%s)
      echo "$(date '+%F %T') $id QUOTA until $when"
      sleep $(( target - $(date +%s) + 120 ))
      echo "$(date '+%F %T') $id RESUME"
      start_r=$(date +%s)
      bash "$REPO/tools/lead/resume.sh" "$id" "${pending[$id]}" > /dev/null 2>&1
      echo "$(date '+%F %T') $id resumed run ended ($(( $(date +%s) - start_r ))s)"
    fi
  done
done
echo "$(date '+%F %T') ALL DONE"
