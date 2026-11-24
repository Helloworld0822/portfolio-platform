#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/cloud-run-api-runtime.sh"

project=portfolio-514800
region=asia-northeast3
service=portfolio-platform
registry="$region-docker.pkg.dev/$project/portfolio-platform"
commit=$(git rev-parse HEAD)
run_args=(--project "$project" --region "$region" --quiet)

current_main() {
  local remote
  remote=$(git ls-remote --exit-code origin refs/heads/main) || exit 1
  [[ "${remote%%[[:space:]]*}" == "$commit" ]]
}

if ! current_main; then
  echo "A newer main commit is waiting for CI. Skipping this release."
  exit 0
fi

state=$(gcloud run services describe "$service" "${run_args[@]}" --format=json)
jq -e '
  ([.spec.template.spec.containers[].name] | sort) == ["api","nginx"]
  and any(.spec.template.spec.containers[] | select(.name=="api") | .env[];
    .name=="DATABASE_URL" and .valueFrom.secretKeyRef.name=="portfolio-neon-database-url")
' <<<"$state" >/dev/null || { echo 'Cloud Run must already use the Neon two-container configuration.' >&2; exit 1; }
previous=$(jq -er '[.status.traffic[] | select(.percent == 100)] | if length == 1 and .[0].revisionName then .[0].revisionName else error("unexpected traffic split") end' <<<"$state")
serving=$(gcloud run revisions describe "$previous" "${run_args[@]}" --format=json)
serving_api=$(jq -er '[.spec.containers[] | select(.name=="api") | .image] | if length==1 then .[0] else error("missing API sidecar") end' <<<"$serving")
selection=${PORTFOLIO_API_RUNTIME:-keep}
if [[ "$selection" == stage-forge ]]; then
  runtime=$(select_api_runtime forge "$serving_api" "$registry")
else
  runtime=$(select_api_runtime "$selection" "$serving_api" "$registry")
fi
api_options=()
if [[ "$runtime" == forge ]]; then
  if [[ "$selection" == forge ]] && ! forge_staging_matches "$commit"; then
    echo 'Forge promotion requires isolated staging verification for the exact main SHA and API digest.' >&2
    exit 1
  fi
  jq -e '
    .spec.template.spec.containers[] | select(.name=="api")
    | ((.command // []) | length)==0 and ((.args // []) | length)==0 and
      any(.volumeMounts[]?; .mountPath=="/app/uploads")
  ' <<<"$state" >/dev/null || { echo 'Unexpected API command or uploads mount; refusing Forge rollout.' >&2; exit 1; }
  workflow_succeeded() {
    local checks
    checks=$(gh run list --repo "$GITHUB_REPOSITORY" --workflow "$1" --commit "$commit" \
      --branch main --event push --status success --limit 1 --json headSha) || return 1
    jq -e --arg commit "$commit" 'any(.[]; .headSha == $commit)' <<<"$checks" >/dev/null
  }
  for ((attempt=0; attempt<80; attempt++)); do
    if workflow_succeeded ci.yml && workflow_succeeded forge.yml; then
      break
    fi
    if ((attempt == 79)); then
      echo 'No successful CI and Forge migration runs for the exact main commit.' >&2
      exit 1
    fi
    sleep 15
  done
  api_options=(--update-env-vars=HOST=0.0.0.0,PORT=8081,FORGE_TRUSTED_PROXIES=127.0.0.1/32)
elif jq -e 'any(.spec.template.spec.containers[] | select(.name=="api") | .env[]; .name=="FORGE_TRUSTED_PROXIES")' <<<"$state" >/dev/null; then
  api_options=(--remove-env-vars=FORGE_TRUSTED_PROXIES)
fi

gcloud auth configure-docker "$region-docker.pkg.dev" --quiet
resolve_image() {
  local name=$1 file=$2 context=$3
  shift 3
  local tree tag digest manifest
  tree=$(git ls-tree -r HEAD -- "$@" | sha256sum | cut -d' ' -f1)
  tag="$registry/$name:src-$tree"
  if ! digest=$(gcloud artifacts docker images describe "$tag" --project "$project" --format='value(image_summary.digest)' 2>/dev/null); then
    local options=(--label "org.opencontainers.image.revision=$commit")
    if [[ "$name" == nginx ]]; then options+=(--build-arg NGINX_CONFIG=nginx/cloud-run.conf); fi
    docker build "${options[@]}" --file "$file" --tag "$tag" "$context" >&2 || return 1
    docker push "$tag" >&2 || return 1
    digest=$(gcloud artifacts docker images describe "$tag" --project "$project" --format='value(image_summary.digest)') || return 1
  fi
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  manifest=$(docker buildx imagetools inspect --raw "$registry/$name@$digest") || return 1
  if jq -e 'has("manifests")' <<<"$manifest" >/dev/null; then
    digest=$(jq -er '[.manifests[] | select(.platform.os == "linux" and .platform.architecture == "amd64")] |
      if length == 1 then .[0].digest else error("expected one Cloud Run platform image") end' <<<"$manifest") || return 1
    [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  fi
  printf '%s/%s@%s\n' "$registry" "$name" "$digest"
}

if [[ "$runtime" == forge ]]; then
  api=$(resolve_image forge-api backend-forge/Containerfile . backend-forge/Containerfile \
    backend-forge/toolchain backend-forge/vendor backend-forge/src backend-forge/native \
    backend-forge/scripts/build.sh backend-forge/openapi.json backend-forge/docs.html \
    backend/migrations scripts/update-forge-toolchain.py .dockerignore .gitmodules)
  if [[ "$selection" == stage-forge ]]; then
    web=$(resolve_image nginx nginx/Containerfile . frontend nginx/Containerfile nginx/cloud-run.conf .dockerignore)
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
      printf 'commit=%s\napi=%s\nnginx=%s\n' "$commit" "$api" "$web" >> "$GITHUB_OUTPUT"
    fi
    echo "Stage in an isolated service (commit=$commit, api=$api). No Cloud Run service was changed."
    exit 0
  fi
  if [[ "$selection" == forge ]] && ! forge_staging_matches "$commit" "${api##*@}"; then
    echo 'Isolated staging digest does not match the resolved Forge API image.' >&2
    exit 1
  fi
  if [[ "$selection" == keep && "$api" != "$serving_api" ]]; then
    echo 'New Forge API digest requires a manual promotion using exact isolated staging evidence.'
    exit 0
  fi
else
  api=$(resolve_image api backend/Containerfile backend backend/Cargo.toml backend/Cargo.lock backend/Containerfile backend/src backend/migrations backend/.dockerignore)
fi
web=$(resolve_image nginx nginx/Containerfile . frontend nginx/Containerfile nginx/cloud-run.conf .dockerignore)
backup=$(resolve_image backup ops/backup/Containerfile ops/backup ops/backup)
if ! current_main; then exit 0; fi
job_args=(--project "$project" --region asia-northeast1 --quiet)
job=$(gcloud run jobs describe portfolio-db-backup "${job_args[@]}" --format=json)
current_backup=$(jq -er '
  .spec.template.spec.template.spec.containers
  | select(length == 1 and .[0].name == "backup")
  | .[0] | select(any(.env[]; .name == "DATABASE_URL" and .valueFrom.secretKeyRef.name == "portfolio-neon-database-url"))
  | .image
' <<<"$job")
if [[ "$current_backup" != "$backup" ]]; then
  gcloud run jobs update portfolio-db-backup "${job_args[@]}" --image "$backup"
fi

if jq -e --arg api "$api" --arg nginx "$web" --arg revision "$previous" '
  .status.latestCreatedRevisionName == $revision and .status.latestReadyRevisionName == $revision
  and ([.spec.template.spec.containers[] | {key:.name,value:.image}]|from_entries) == {api:$api,nginx:$nginx}
' <<<"$state" >/dev/null \
  && { [[ "$runtime" != forge ]] || jq -c '.spec.containers' <<<"$serving" | forge_api_config_matches; }; then
  echo "The serving revision already uses these digests (API: $runtime)."
  exit 0
fi

if ! current_main; then exit 0; fi
staging_tag="ci-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
remove_staging_tag() {
  gcloud run services update-traffic "$service" "${run_args[@]}" --remove-tags="$staging_tag"
}
trap remove_staging_tag EXIT
gcloud run services update "$service" "${run_args[@]}" --tag "$staging_tag" --no-traffic \
  --container nginx --image "$web" --container api --image "$api" "${api_options[@]}"
candidate=$(gcloud run services describe "$service" "${run_args[@]}" --format=json |
  jq -er --arg tag "$staging_tag" '.status.traffic[] | select(.tag == $tag) | .revisionName')
[[ -n "$candidate" && "$candidate" != "$previous" ]]
ready=false
for ((attempt=0; attempt<48; attempt++)); do
  revision=$(gcloud run revisions describe "$candidate" "${run_args[@]}" --format=json)
  jq -e --arg api "$api" --arg nginx "$web" '
    ([.spec.containers[] | {key:.name,value:.image}]|from_entries) == {api:$api,nginx:$nginx}
  ' <<<"$revision" >/dev/null
  if [[ "$runtime" == forge ]]; then
    jq -c '.spec.containers' <<<"$revision" | forge_api_config_matches
  fi
  if jq -e 'any(.status.conditions[]; .type=="Ready" and .status=="True")
    and any(.status.conditions[]; .type=="ContainerHealthy" and .status=="True")' <<<"$revision" >/dev/null; then
    ready=true
    break
  fi
  if jq -e 'any(.status.conditions[]; .type=="Ready" and .status=="False")' <<<"$revision" >/dev/null; then break; fi
  sleep 5
done
if [[ "$ready" != true ]]; then echo "$candidate failed startup checks." >&2; exit 1; fi
if ! current_main; then exit 0; fi
gcloud run services update-traffic "$service" "${run_args[@]}" --to-revisions "$candidate=100"
check_release() {
  local path
  for path in /api/health /api/profile /api/projects /api/timeline /api/posts /images/jaemin.jpg; do
    curl --fail --silent --show-error --max-time 15 --retry 3 --retry-all-errors \
      "https://portfolio.helloworld0822.xyz$path" --output /dev/null || return 1
  done
}
confirm_serving_revision() {
  local live
  live=$(gcloud run services describe "$service" "${run_args[@]}" --format=json) || return 1
  jq -e --arg revision "$candidate" '
    [.status.traffic[] | select(.percent == 100)] |
    length == 1 and .[0].revisionName == $revision
  ' <<<"$live" >/dev/null
}
if ! check_release || ! confirm_serving_revision; then
  gcloud run services update-traffic "$service" "${run_args[@]}" --to-revisions "$previous=100"
  exit 1
fi
remove_staging_tag
trap - EXIT
echo "Serving $candidate (runtime=$runtime, api=$api, nginx=$web)"
