#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

probe() {
  local label="$1"
  local url="$2"
  shift 2

  local headers_file
  local body_file
  headers_file="$(mktemp)"
  body_file="$(mktemp)"

  curl -sS -o "$body_file" -D "$headers_file" "$url" "$@"

  local status
  local location
  status="$(awk 'toupper($1) ~ /^HTTP\\// { code=$2 } END { print code }' "$headers_file")"
  location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ { sub(/^[^:]*:[[:space:]]*/, \"\"); sub(/\\r$/, \"\"); print; exit }' "$headers_file")"

  echo "[$label] $url"
  echo "status: ${status:-unknown}"
  echo "location: ${location:-<none>}"
  echo

  rm -f "$headers_file" "$body_file"
}

probe \
  "document-nav" \
  "$BASE_URL/onboarding" \
  -H "sec-fetch-mode: navigate" \
  -H "sec-fetch-dest: document" \
  -H "sec-fetch-user: ?1"

probe \
  "rsc-probe" \
  "$BASE_URL/onboarding?_rsc=probe" \
  -H "accept: */*"
