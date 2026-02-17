#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

show_first_lines() {
  local title="$1"
  local url="$2"
  shift 2
  local tmp
  tmp="$(mktemp)"
  echo "== ${title} =="
  curl -i -sS "$url" "$@" -o "$tmp"
  awk 'NR<=20{print} /^\r?$/{exit}' "$tmp"
  rm -f "$tmp"
  echo
}

show_first_lines "RSC /business" "${BASE_URL}/business?_rsc=probe" -H "accept: */*"
show_first_lines "RSC /" "${BASE_URL}/?_rsc=probe" -H "accept: */*"

echo "== Normal HTML /business/onboarding =="
curl -I -sS "${BASE_URL}/business/onboarding" | grep -iE 'HTTP/|content-type|location' || true

echo
echo "== Asset /favicon.ico =="
curl -I -sS "${BASE_URL}/favicon.ico" | grep -iE 'HTTP/|content-type|location' || true
