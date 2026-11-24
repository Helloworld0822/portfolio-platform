#!/usr/bin/env bash
set -euo pipefail
umask 077

commit=${1:?expected commit} api=${2:?expected Forge image} nginx=${3:?expected nginx image}
project=portfolio-514800
region=asia-northeast3
registry="$region-docker.pkg.dev/$project/portfolio-platform"
caller="portfolio-deploy@$project.iam.gserviceaccount.com"
[[ "$commit" =~ ^[0-9a-f]{40}$ && "$commit" == "${GITHUB_SHA:?}" ]]
[[ "$api" == "$registry/forge-api@"* && "${api##*@}" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ "$nginx" == "$registry/nginx@"* && "${nginx##*@}" =~ ^sha256:[0-9a-f]{64}$ ]]
: "${STAGE_ID_TOKEN:?expected audience-bound Workload Identity token}" "${RUNNER_TEMP:?}"

suffix=$(openssl rand -hex 8)
service="forge-stg-$suffix"
bucket="$project-$service"
fixture_name="$registry/$service-fixture"
dir=$(mktemp -d "$RUNNER_TEMP/forge-stage.XXXXXX")
evidence="$RUNNER_TEMP/forge-staging-evidence.json"
rm -f "$evidence"
regional=(--project "$project" --region "$region" --quiet)
owned_identity="" bucket_created=false image_created=false service_started=false
cleanup() {
    local status=$?
    trap - EXIT
    if [[ "$service_started" == true ]]; then
        gcloud run services delete "$service" "${regional[@]}" || status=1
    fi
    if [[ "$bucket_created" == true ]]; then
        gcloud storage rm --recursive "gs://$bucket" --quiet || status=1
    fi
    if [[ "$image_created" == true ]]; then
        gcloud artifacts docker images delete "$fixture_name:check" --delete-tags --quiet || status=1
    fi
    if [[ -n "$owned_identity" ]]; then
        gcloud iam service-accounts delete "$owned_identity" --project "$project" --quiet || status=1
    fi
    if [[ "$status" == 0 ]]; then
        mv "$dir/evidence.json" "$evidence" || status=1
    fi
    rm -rf "$dir"
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

shared_identity="portfolio-forge-stage@$project.iam.gserviceaccount.com"
identity=$(gcloud iam service-accounts list --project "$project" \
    --filter="email=$shared_identity" --format='value(email)')
if [[ -z "$identity" ]]; then
    gcloud iam service-accounts create "$service" --project "$project" \
        --display-name="Disposable Forge stage ${GITHUB_RUN_ID:?}"
    identity="$service@$project.iam.gserviceaccount.com"
    owned_identity="$identity"
    gcloud iam service-accounts add-iam-policy-binding "$identity" --project "$project" \
        --member="serviceAccount:$caller" --role=roles/iam.serviceAccountUser --quiet >/dev/null
else
    [[ "$identity" == "$shared_identity" ]]
fi
gcloud storage buckets create "gs://$bucket" --project "$project" --location "$region" \
    --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=0
bucket_created=true
gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
    --member="serviceAccount:$identity" --role=roles/storage.objectUser >/dev/null

docker build -f scripts/forge-stage/Containerfile --tag "$fixture_name:check" .
docker push "$fixture_name:check"
image_created=true
fixture_digest=$(gcloud artifacts docker images describe "$fixture_name:check" --project "$project" \
    --format='value(image_summary.digest)')
[[ "$fixture_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
fixture="$fixture_name@$fixture_digest"
export STAGE_DB_PASSWORD STAGE_JWT
STAGE_DB_PASSWORD=$(openssl rand -hex 24)
STAGE_JWT=$(openssl rand -hex 32)
admin=$(PYTHONPATH=backend-forge/tests TEST_JWT_SECRET="$STAGE_JWT" python3 -c 'from integration import token; print(token())')
auth_header="X-Serverless-Authorization: Bearer $STAGE_ID_TOKEN"
get() { curl -fsS --max-time 20 -H "$auth_header" "$url$1"; }

for schema in fresh upgraded; do
    python3 scripts/forge-stage/manifest.py "$service" "$bucket" "$identity" \
        "$api" "$nginx" "$fixture" "$schema" > "$dir/service.yaml"
    if [[ "$schema" == fresh ]]; then
        existing=$(gcloud run services list "${regional[@]}" --filter="metadata.name=$service" --format='value(metadata.name)')
        [[ -z "$existing" ]]
        service_started=true
    fi
    gcloud run services replace "$dir/service.yaml" "${regional[@]}"
    if [[ "$schema" == fresh ]]; then
        gcloud run services add-iam-policy-binding "$service" "${regional[@]}" \
            --member="serviceAccount:$caller" --role=roles/run.invoker >/dev/null
    fi
    state=$(gcloud run services describe "$service" "${regional[@]}" --format=json)
    revision=$(jq -er '.status.latestReadyRevisionName | select(.!=null)' <<<"$state")
    jq -e --arg rev "$revision" '.status.latestCreatedRevisionName == $rev and
        any(.status.traffic[]; .revisionName==$rev and .percent==100)' <<<"$state" >/dev/null
    gcloud run revisions describe "$revision" "${regional[@]}" --format=json > "$dir/revision"
    jq -e --arg api "$api" --arg nginx "$nginx" --arg bucket "$bucket" --arg identity "$identity" \
        --arg schema "$schema" '.spec.serviceAccountName==$identity and
        any(.status.conditions[]; .type=="Ready" and .status=="True") and
        any(.spec.containers[]; .name=="api" and .image==$api and
          any(.volumeMounts[]; .mountPath=="/app/uploads" and .name=="uploads")) and
        any(.spec.containers[]; .name=="nginx" and .image==$nginx) and
        any(.spec.containers[]; .name=="verify" and any(.env[]; .name=="STAGE_SCHEMA" and .value==$schema)) and
        any(.spec.volumes[]; .name=="uploads" and .csi.volumeAttributes.bucketName==$bucket)' "$dir/revision" >/dev/null
    url=$(jq -er '.status.url' <<<"$state")
    [[ "$url" =~ ^https://[a-z0-9.-]+\.run\.app$ ]]
    anonymous=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$url/api/health")
    [[ "$anonymous" == 401 || "$anonymous" == 403 ]]
    get /api/health | jq -e '.status=="ok"' >/dev/null
    for path in / /portfolio /blog; do
        get "$path" > "$dir/index.html"
        grep -q 'id="root"' "$dir/index.html"
    done
    asset=$(grep -oE '/assets/[^" ]+\.js' "$dir/index.html" | head -1)
    get "$asset" > "$dir/asset"
    [[ -s "$dir/asset" ]]
    get /api/projects | jq -e 'type=="array"' >/dev/null
    get /api/profile | jq -e '.photo=="/images/jaemin.jpg"' >/dev/null
    get /images/jaemin.jpg > "$dir/photo"
    [[ -s "$dir/photo" ]]
    openssl rand 48 > "$dir/upload.png"
    upload=$(curl -fsS --max-time 30 -H "$auth_header" -H "Authorization: Bearer $admin" \
        -F "file=@$dir/upload.png;type=image/png" "$url/api/admin/uploads" | jq -er '.url')
    [[ "$upload" =~ ^/uploads/[0-9a-f-]{36}\.png$ ]]
    get "$upload" > "$dir/readback"
    cmp "$dir/upload.png" "$dir/readback"
    gcloud storage cat "gs://$bucket/${upload##*/}" > "$dir/object"
    cmp "$dir/upload.png" "$dir/object"
    echo "$revision" > "$dir/$schema"
done
jq -n --arg commit "$commit" --arg digest "${api##*@}" --arg api "$api" --arg nginx "$nginx" \
    --arg fresh "$(cat "$dir/fresh")" --arg upgraded "$(cat "$dir/upgraded")" \
    '{commit:$commit,digest:$digest,api:$api,nginx:$nginx,revisions:{fresh:$fresh,upgraded:$upgraded}}' > "$dir/evidence.json"
