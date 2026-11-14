#!/usr/bin/env bash
# Strict gate: any failure stops with a non-zero exit (no pipes masking codes).
# Unit tests: if the only failures are timeouts (machine under load), rerun once; any real assertion failure fails.
set -euo pipefail
dir="${1:-.}"
cd "$dir"
pnpm exec eslint . --max-warnings=0 > "${TMPDIR:-/tmp}"/gate-lint.txt 2>&1 || { echo "GATE FAIL: lint"; grep -E "error|warning" "${TMPDIR:-/tmp}"/gate-lint.txt | head -10; exit 1; }
pnpm typecheck > "${TMPDIR:-/tmp}"/gate-tc.txt 2>&1 || { echo "GATE FAIL: typecheck"; tail -15 "${TMPDIR:-/tmp}"/gate-tc.txt; exit 1; }
if ! pnpm exec vitest run --maxWorkers=4 --testTimeout=60000 > "${TMPDIR:-/tmp}"/gate-unit.txt 2>&1; then
  if grep -qE "AssertionError|TypeError|ReferenceError|SyntaxError" "${TMPDIR:-/tmp}"/gate-unit.txt || ! grep -q "timed out" "${TMPDIR:-/tmp}"/gate-unit.txt; then
    echo "GATE FAIL: unit"; grep -E "FAIL|Tests |Error" "${TMPDIR:-/tmp}"/gate-unit.txt | head -15; exit 1
  fi
  echo "unit: timeouts only, rerunning once"
  pnpm exec vitest run --maxWorkers=4 --testTimeout=60000 > "${TMPDIR:-/tmp}"/gate-unit.txt 2>&1 || { echo "GATE FAIL: unit (rerun)"; grep -E "FAIL|Tests |Error" "${TMPDIR:-/tmp}"/gate-unit.txt | head -15; exit 1; }
fi
pnpm -s check:assets > "${TMPDIR:-/tmp}"/gate-assets.txt 2>&1 || { echo "GATE FAIL: check:assets"; grep -oE '"errors":\[[^]]*\]' "${TMPDIR:-/tmp}"/gate-assets.txt | cut -c1-600; exit 1; }
pnpm -s check:licenses > "${TMPDIR:-/tmp}"/gate-licenses.txt 2>&1 || { echo "GATE FAIL: check:licenses"; tail -10 "${TMPDIR:-/tmp}"/gate-licenses.txt; exit 1; }
echo "GATE PASS: lint, typecheck, assets, licenses, $(grep -E 'Tests ' "${TMPDIR:-/tmp}"/gate-unit.txt | tr -s ' ')"
