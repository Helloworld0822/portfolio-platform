#!/usr/bin/env bash
set -euo pipefail

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

gcloud auth configure-docker "$region-docker.pkg.dev" --quiet
resolve_image() {
  local name=$1 file=$2 context=$3
  shift 3
  local tree tag digest
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
  printf '%s/%s@%s\n' "$registry" "$name" "$digest"
}

api=$(resolve_image api backend/Containerfile backend backend/Cargo.toml backend/Cargo.lock backend/Containerfile backend/src backend/migrations backend/.dockerignore)
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

state=$(gcloud run services describe "$service" "${run_args[@]}" --format=json)
jq -e '
  ([.spec.template.spec.containers[].name] | sort) == ["api","nginx"]
  and any(.spec.template.spec.containers[] | select(.name=="api") | .env[];
    .name=="DATABASE_URL" and .valueFrom.secretKeyRef.name=="portfolio-neon-database-url")
' <<<"$state" >/dev/null || { echo 'Cloud Run must already use the Neon two-container configuration.' >&2; exit 1; }
previous=$(jq -er '[.status.traffic[] | select(.percent == 100)] | if length == 1 then .[0].revisionName else error("unexpected traffic split") end' <<<"$state")
if jq -e --arg api "$api" --arg nginx "$web" --arg revision "$previous" '
  .status.latestCreatedRevisionName == $revision and .status.latestReadyRevisionName == $revision
  and ([.spec.template.spec.containers[] | {key:.name,value:.image}]|from_entries) == {api:$api,nginx:$nginx}
' <<<"$state" >/dev/null; then
  echo "The serving revision already uses these digests."
  exit 0
fi

if ! current_main; then exit 0; fi
staging_tag="ci-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
remove_staging_tag() {
  gcloud run services update-traffic "$service" "${run_args[@]}" --remove-tags="$staging_tag"
}
trap remove_staging_tag EXIT
candidate=$(gcloud run services update "$service" "${run_args[@]}" --tag "$staging_tag" --no-traffic \
  --format='value(status.latestCreatedRevisionName)' --container nginx --image "$web" --container api --image "$api")
[[ -n "$candidate" && "$candidate" != "$previous" ]]
ready=false
for ((attempt=0; attempt<48; attempt++)); do
  revision=$(gcloud run revisions describe "$candidate" "${run_args[@]}" --format=json)
  jq -e --arg api "$api" --arg nginx "$web" '
    ([.spec.containers[] | {key:.name,value:.image}]|from_entries) == {api:$api,nginx:$nginx}
  ' <<<"$revision" >/dev/null
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
  for path in /api/health /api/projects; do
    curl --fail --silent --show-error --max-time 15 --retry 3 --retry-all-errors \
      "https://portfolio.helloworld0822.xyz$path" --output /dev/null || return 1
  done
}
if ! check_release; then
  gcloud run services update-traffic "$service" "${run_args[@]}" --to-revisions "$previous=100"
  exit 1
fi
remove_staging_tag
trap - EXIT
echo "Serving $candidate (api=$api, nginx=$web)"
