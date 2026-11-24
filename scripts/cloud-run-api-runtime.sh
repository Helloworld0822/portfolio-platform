select_api_runtime() {
  local choice=$1 serving_image=$2 registry=$3 serving_runtime
  case "$serving_image" in
    "$registry/api@sha256:"*) serving_runtime=rust ;;
    "$registry/forge-api@sha256:"*) serving_runtime=forge ;;
    *) echo "Refusing to replace an unrecognized serving API image." >&2; return 1 ;;
  esac
  [[ "${serving_image##*@}" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  case "$choice" in
    keep) printf '%s\n' "$serving_runtime" ;;
    rust|forge) printf '%s\n' "$choice" ;;
    *) echo "Invalid API runtime selection." >&2; return 1 ;;
  esac
}

forge_api_config_matches() {
  jq -e '
    [.[] | select(.name=="api")] | length==1 and
    (.[0] | ((.command // []) | length)==0 and ((.args // []) | length)==0 and
      any(.env[]; .name=="HOST" and .value=="0.0.0.0") and
      any(.env[]; .name=="PORT" and .value=="8081") and
      any(.env[]; .name=="FORGE_TRUSTED_PROXIES" and .value=="127.0.0.1/32") and
      any(.volumeMounts[]?; .mountPath=="/app/uploads"))
  ' >/dev/null
}

forge_staging_matches() {
  local commit=$1 digest=${2:-${FORGE_STAGING_DIGEST:-}}
  [[ "${FORGE_STAGING_COMMIT:-}" == "$commit" ]] &&
    [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] &&
    [[ "$digest" == "${FORGE_STAGING_DIGEST:-}" ]]
}
