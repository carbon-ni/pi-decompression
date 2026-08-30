#!/usr/bin/env bash
set -u

log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT

if npm run -s lint >"$log_file" 2>&1 \
  && npm run -s typecheck >>"$log_file" 2>&1 \
  && npm run -s test >>"$log_file" 2>&1; then
  printf 'true\n'
  exit 0
fi

printf 'false\n'
tail -n 80 "$log_file"
exit 1
