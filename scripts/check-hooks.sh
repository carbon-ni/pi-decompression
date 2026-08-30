#!/usr/bin/env bash
set -u

expected_path=".githooks"
actual_path="$(git config --get core.hooksPath || true)"

if [[ "$actual_path" == "$expected_path" ]] \
  && [[ -x .githooks/pre-commit ]] \
  && [[ -x .githooks/pre-push ]] \
  && [[ -x .githooks/commit-msg ]]; then
  printf 'true\n'
  exit 0
fi

printf 'false\n'
printf 'Run: make hooks-install\n'
exit 1
