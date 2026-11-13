#!/usr/bin/env bash
# Sourced by dispatch.sh, dispatch-agy.sh, resume.sh, merge.sh.
# Each worker keeps ONE persistent worktree (D:/tqa-worktrees/W-<slot>) and switches branches per ticket, so Codex's
# elevated Windows sandbox grants folder access once per worker instead of once per ticket (Duy, 2026-11-13:
# stop the repeated "sandbox setup" prompts). D:/tqa-worktrees/<ID>.wt records which folder a ticket uses;
# tickets without that file keep the old one-worktree-per-ticket path.
TQA_REPO=D:/the-quiet-atlas
TQA_WT_ROOT=D:/tqa-worktrees

# Slot from $WORKER, else from $CODEX_HOME (.codex→A, .codex2→B, …), else empty (old behaviour).
slot_name() {
  if [ -n "${WORKER:-}" ]; then echo "$WORKER"; return; fi
  case "$(basename "${CODEX_HOME:-}")" in
    .codex) echo A;; .codex2) echo B;; .codex3) echo C;; .codex4) echo D;; .codex5) echo E;; *) echo "";;
  esac
}

# Worktree folder of a ticket (dispatched or old style).
wt_for() { if [ -f "$TQA_WT_ROOT/$1.wt" ]; then cat "$TQA_WT_ROOT/$1.wt"; else echo "$TQA_WT_ROOT/$1"; fi; }

# Prepare the slot folder for ticket $1 on branch lane/$1 from main. Prints the folder; non-zero on refusal.
prepare_slot() {
  local id="$1" slot wt busy
  slot="$(slot_name)"
  if [ -z "$slot" ]; then
    wt="$TQA_WT_ROOT/$id"
    git -C "$TQA_REPO" worktree add -q "$wt" -b "lane/$id" >&2 || return 1
  else
    wt="$TQA_WT_ROOT/W-$slot"; busy="$TQA_WT_ROOT/W-$slot.busy"
    if [ -f "$busy" ]; then echo "slot W-$slot busy with $(cat "$busy"); merge or release it first" >&2; return 1; fi
    if [ -d "$wt" ]; then
      [ -z "$(git -C "$wt" status --porcelain)" ] || { echo "slot W-$slot has uncommitted changes" >&2; return 1; }
      git -C "$wt" checkout -q -B "lane/$id" main >&2 || return 1
    else
      git -C "$TQA_REPO" worktree add -q "$wt" -b "lane/$id" >&2 || return 1
    fi
    echo "$id" > "$busy"
  fi
  echo "$wt" > "$TQA_WT_ROOT/$id.wt"
  (cd "$wt" && { pnpm install --frozen-lockfile --offline > /dev/null 2>&1 || pnpm install --frozen-lockfile > /dev/null 2>&1; }) || return 1
  echo "$wt"
}

# After merge (or to abandon a ticket): free the slot, keep the folder; old-style worktrees are removed.
release_ticket() {
  local id="$1" wt; wt="$(wt_for "$id")"
  case "$wt" in
    "$TQA_WT_ROOT"/W-*)
      git -C "$wt" checkout -q --detach main && git -C "$TQA_REPO" branch -D -q "lane/$id"
      rm -f "$wt.busy" "$TQA_WT_ROOT/$id.wt";;
    *) git -C "$TQA_REPO" worktree remove --force "$wt" && git -C "$TQA_REPO" branch -D -q "lane/$id"
      rm -f "$TQA_WT_ROOT/$id.wt";;
  esac
}
