#!/usr/bin/env bash
# Usage: wait-any.sh <ID> [<ID> ...]
# Blocks (cheaply, no tokens) until ANY listed ticket finishes or hits a usage limit, then prints one line per
# ticket that changed and exits. Finished = D:/tqa-worktrees/<ID>.last.md newer than this script's start and its
# log quiet for 90 s. Limit = log tail says "usage limit". Run it in the background and act when it exits.
set -uo pipefail
start=$(date +%s)
while :; do
  hit=0
  for id in "$@"; do
    log=D:/tqa-worktrees/$id.resume.log
    [ -f "$log" ] && [ "$(date -r "$log" +%s)" -ge "$start" ] || log=D:/tqa-worktrees/$id.log
    [ -f "$log" ] || continue
    age=$(( $(date +%s) - $(date -r "$log" +%s) ))
    if tail -c 3000 "$log" | grep -q "usage limit" && [ "$(date -r "$log" +%s)" -ge "$start" ]; then
      echo "$id LIMIT $(grep -o 'try again at [^.]*' "$log" | tail -1)"; hit=1; continue
    fi
    # Stalled: no log write for 25 min (a worker stuck on a sandbox error never writes .last.md in time).
    if [ "$age" -ge 1500 ] && [ "$(date -r "$log" +%s)" -ge "$start" -o $(( $(date +%s) - start )) -ge 1500 ]; then
      echo "$id STALL (log idle $((age / 60)) min)"; hit=1; continue
    fi
    last=D:/tqa-worktrees/$id.last.md
    if [ -s "$last" ] && [ "$(date -r "$last" +%s)" -ge "$start" ] && [ "$age" -ge 90 ]; then
      echo "$id DONE"; hit=1
    fi
  done
  [ $hit = 1 ] && exit 0
  sleep 60
done
