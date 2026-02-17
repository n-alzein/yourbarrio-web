#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TMP_HTML="$(mktemp)"
trap 'rm -f "$TMP_HTML"' EXIT

curl -sS "${BASE_URL}/" > "$TMP_HTML"
CHUNK_PATH="$(tr '"' '\n' < "$TMP_HTML" | rg '^/_next/static/chunks/' -m 1 || true)"
if [[ -z "$CHUNK_PATH" ]]; then
  CHUNK_PATH="/_next/static/chunks"
fi

echo "== 1) Document navigation HTML check =="
curl -i -sS "${BASE_URL}/business/onboarding" \
  -H 'sec-fetch-mode: navigate' \
  -H 'sec-fetch-dest: document' | head -n 20

echo
echo "== 2) Flight-like request must not be 3xx =="
curl -i -sS "${BASE_URL}/business?_rsc=probe" \
  -H 'accept: */*' | head -n 30

echo
echo "== 3) Asset checks (no redirect) =="
echo "-- /favicon.ico --"
curl -I -sS "${BASE_URL}/favicon.ico" | head -n 20

echo "-- ${CHUNK_PATH} --"
curl -I -sS "${BASE_URL}${CHUNK_PATH}" | head -n 20

echo
echo "== 4) API /api/me JSON no redirect =="
curl -i -sS "${BASE_URL}/api/me" \
  -H 'accept: application/json' | head -n 30
