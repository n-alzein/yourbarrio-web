#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

probe() {
  local path="$1"
  local label="$2"
  local tmp
  tmp="$(mktemp)"

  curl -i -sS "${BASE_URL}${path}" -H "accept: */*" -o "$tmp"

  local status
  local content_type
  local location
  status="$(awk 'NR==1 {print $2}' "$tmp" | tr -d '\r')"
  content_type="$(awk -F': ' 'tolower($1)=="content-type" {print $2}' "$tmp" | tr -d '\r' | head -n1)"
  location="$(awk -F': ' 'tolower($1)=="location" {print $2}' "$tmp" | tr -d '\r' | head -n1)"

  echo "[$label]"
  echo "url=${BASE_URL}${path}"
  echo "status=${status:-unknown}"
  echo "content-type=${content_type:-<none>}"
  echo "location=${location:-<none>}"
  echo

  rm -f "$tmp"
}

probe "/?_rsc=probe" "root"
probe "/business?_rsc=probe" "business"
probe "/business/onboarding?_rsc=probe" "business-onboarding"
