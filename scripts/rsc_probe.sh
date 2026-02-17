#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
OUT_PREFIX="${OUT_PREFIX:-/tmp/rsc_probe}"
REFERER="${REFERER:-http://localhost:3000/business/onboarding}"

ENDPOINTS=(
  "/?_rsc=test"
  "/business?_rsc=test"
  "/business/onboarding?_rsc=test"
)

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

  echo "[$label]"
  echo "status=${status:-unknown}"
  echo "location=${location:-<none>}"
  echo "content-type=${content_type:-<none>}"
  echo -n "body[0:200]="
  head -c 200 "$body_file" | tr '\n' ' ' | sed 's/[[:cntrl:]]/ /g'
  echo
  echo
}

run_probe() {
  local route="$1"
  local short_name="$2"
  local accept_value="$3"
  local follow_mode="$4"
  local mode_suffix="$5"

  local headers_file="${OUT_PREFIX}_${short_name}_${mode_suffix}.headers"
  local body_file="${OUT_PREFIX}_${short_name}_${mode_suffix}.body"
  local full_file="${OUT_PREFIX}_${short_name}_${mode_suffix}.txt"
  local follow_flag=""
  if [[ "$follow_mode" == "follow" ]]; then
    follow_flag="-L"
  fi

  curl -sS -i ${follow_flag} "${BASE_URL}${route}" \
    -H "rsc: 1" \
    -H "next-router-prefetch: 1" \
    -H "next-router-segment-prefetch: /_tree" \
    -H "accept: ${accept_value}" \
    -H "referer: ${REFERER}" \
    -o "$full_file"

  awk 'BEGIN{splitter=0} { if (splitter==0 && $0 ~ /^\r?$/) {splitter=1; next} if (splitter==0) print }' "$full_file" > "$headers_file"
  awk 'BEGIN{splitter=0} { if (splitter==0 && $0 ~ /^\r?$/) {splitter=1; next} if (splitter==1) print }' "$full_file" > "$body_file"

  print_summary "${short_name}:${mode_suffix}" "$headers_file" "$body_file"
}

echo "RSC probe started at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "base_url=${BASE_URL}"
echo "out_prefix=${OUT_PREFIX}"
echo

for route in "${ENDPOINTS[@]}"; do
  short="$(echo "$route" | sed -E 's#^/##; s/\?_rsc=test$//; s#/#_#g; s/^$/root/')"
  run_probe "$route" "$short" "*/*" "no_follow" "accept_any"
  run_probe "$route" "$short" "*/*" "follow" "accept_any_follow"
  run_probe "$route" "$short" "text/x-component" "no_follow" "accept_x_component"
  run_probe "$route" "$short" "text/x-component" "follow" "accept_x_component_follow"
done

echo "RSC probe complete."
