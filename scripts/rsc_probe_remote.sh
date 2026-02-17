#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${BASE_URL:-}" ]]; then
  echo "ERROR: BASE_URL is required (example: BASE_URL=https://yourbarrio.com)" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
REFERER="${REFERER:-${BASE_URL}/business/onboarding}"
OUT_PREFIX="${OUT_PREFIX:-/tmp/rsc_probe_remote}"

PATHS=(
  "/"
  "/business"
  "/business/onboarding"
)

VARIANTS=(
  "xcomp_rsc|text/x-component|1"
  "any_rsc|*/*|1"
  "any_plain|*/*|0"
)

safe_name() {
  local value="$1"
  echo "$value" | sed -E 's#^/##; s#/#_#g; s#[^a-zA-Z0-9_\\-]#_#g; s#^$#root#'
}

print_summary() {
  local label="$1"
  local headers_file="$2"
  local body_file="$3"
  local status
  local location
  local content_type

  status="$(awk 'NR==1 {print $2}' "$headers_file" | tr -d '\r')"
  location="$(awk -F': ' 'tolower($1)=="location" {print $2}' "$headers_file" | tr -d '\r' | head -n1)"
  content_type="$(awk -F': ' 'tolower($1)=="content-type" {print $2}' "$headers_file" | tr -d '\r' | head -n1)"

  printf "%-34s status=%-4s location=%s content-type=%s\n" \
    "$label" "${status:-unknown}" "${location:-<none>}" "${content_type:-<none>}"
  echo -n "  body[0:200]="
  head -c 200 "$body_file" | tr '\n' ' ' | sed 's/[[:cntrl:]]/ /g'
  echo
}

run_probe() {
  local path="$1"
  local variant="$2"
  local accept_value="$3"
  local use_rsc_headers="$4"

  local path_key variant_key headers_file body_file raw_file
  path_key="$(safe_name "$path")"
  variant_key="$(safe_name "$variant")"
  raw_file="${OUT_PREFIX}_${path_key}_${variant_key}.txt"
  headers_file="${OUT_PREFIX}_${path_key}_${variant_key}.headers"
  body_file="${OUT_PREFIX}_${path_key}_${variant_key}.body"

  if [[ "$use_rsc_headers" == "1" ]]; then
    curl -sS -i "${BASE_URL}${path}?_rsc=test" \
      -H "rsc: 1" \
      -H "next-router-prefetch: 1" \
      -H "next-router-segment-prefetch: /_tree" \
      -H "accept: ${accept_value}" \
      -H "referer: ${REFERER}" \
      -o "$raw_file"
  else
    curl -sS -i "${BASE_URL}${path}?_rsc=test" \
      -H "accept: ${accept_value}" \
      -H "referer: ${REFERER}" \
      -o "$raw_file"
  fi

  awk 'BEGIN{splitter=0} { if (splitter==0 && $0 ~ /^\r?$/) {splitter=1; next} if (splitter==0) print }' "$raw_file" > "$headers_file"
  awk 'BEGIN{splitter=0} { if (splitter==0 && $0 ~ /^\r?$/) {splitter=1; next} if (splitter==1) print }' "$raw_file" > "$body_file"

  print_summary "${path} ${variant}" "$headers_file" "$body_file"
}

echo "Remote RSC probe started at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "base_url=${BASE_URL}"
echo "referer=${REFERER}"
echo "out_prefix=${OUT_PREFIX}"
echo

for path in "${PATHS[@]}"; do
  for spec in "${VARIANTS[@]}"; do
    IFS='|' read -r name accept use_rsc <<< "$spec"
    run_probe "$path" "$name" "$accept" "$use_rsc"
  done
done

echo
echo "3xx Summary"
echo "-----------"
found_redirect=0
for headers in "${OUT_PREFIX}"_*.headers; do
  [[ -e "$headers" ]] || continue
  status="$(awk 'NR==1 {print $2}' "$headers" | tr -d '\r')"
  if [[ "$status" =~ ^3[0-9][0-9]$ ]]; then
    found_redirect=1
    location="$(awk -F': ' 'tolower($1)=="location" {print $2}' "$headers" | tr -d '\r' | head -n1)"
    echo "$(basename "$headers"): status=${status} location=${location:-<none>}"
  fi
done
if [[ "$found_redirect" -eq 0 ]]; then
  echo "No 3xx responses detected."
fi

echo
echo "Remote RSC probe complete."
