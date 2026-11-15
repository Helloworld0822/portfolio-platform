#!/bin/sh
set -eu
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$APP_ROOT"
TEST_SUFFIX=$(date +%s)-$$
NETWORK="forge-check-$TEST_SUFFIX"
DB_NAME="forge-db-$TEST_SUFFIX"
API_NAME="forge-api-$TEST_SUFFIX"
CHECK_NAME="forge-checker-$TEST_SUFFIX"
API_IMAGE="portfolio-forge:check-$TEST_SUFFIX"
TOOL_IMAGE="portfolio-forge-toolchain:check-$TEST_SUFFIX"
cleanup() {
    docker rm -f "$CHECK_NAME" "$API_NAME" "$DB_NAME" >/dev/null 2>&1 || true
    docker network rm "$NETWORK" >/dev/null 2>&1 || true
    docker image rm "$API_IMAGE" "$TOOL_IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
for MODULE_NAME in forge-postgres forge-web; do
    test -f "backend-forge/vendor/$MODULE_NAME/CMakeLists.txt" || { echo 'Run GIT_MASTER=1 git submodule update --init --recursive first' >&2; exit 1; }
done
docker build -f backend-forge/Containerfile -t "$API_IMAGE" .
docker build -f backend-forge/Containerfile.test -t "$TOOL_IMAGE" backend-forge

docker network create --label forge.migration=test "$NETWORK" >/dev/null
docker run -d --name "$DB_NAME" --network "$NETWORK" --network-alias postgres --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=forge -e POSTGRES_PASSWORD=forge-test-password -e POSTGRES_DB=forge_test postgres:16-alpine >/dev/null
TEST_SUBNET=$(docker network inspect -f '{{(index .IPAM.Config 0).Subnet}}' "$NETWORK")
ATTEMPT=0
until docker exec "$DB_NAME" pg_isready -h 127.0.0.1 -U forge -d forge_test >/dev/null 2>&1; do
    ATTEMPT=$((ATTEMPT + 1)); test "$ATTEMPT" -lt 60 || { docker logs "$DB_NAME"; exit 1; }; sleep 1
done
docker run -d --name "$API_NAME" --network "$NETWORK" --network-alias api -e DATABASE_URL='postgres://forge:forge-test-password@postgres/forge_test?connect_timeout=5' -e DATABASE_POOL_SIZE=1 -e FORGE_TRUSTED_PROXIES="$TEST_SUBNET" -e JWT_SECRET=forge-integration-test-secret -e ADMIN_GITHUB_USERNAME=Helloworld0822 -e GITHUB_CLIENT_ID=test-client -e GITHUB_CLIENT_SECRET=test-client-secret -e FRONTEND_URL=http://frontend.test -e BACKEND_BASE_URL=http://api:8080 -e CORS_ALLOWED_ORIGINS=http://frontend.test -e GITHUB_OAUTH_BASE_URL=http://checker:19090 -e GITHUB_API_BASE_URL=http://checker:19090 "$API_IMAGE" >/dev/null
ATTEMPT=0
until docker exec "$API_NAME" curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; do
    ATTEMPT=$((ATTEMPT + 1)); test "$ATTEMPT" -lt 60 || { docker logs "$DB_NAME"; docker logs "$API_NAME"; exit 1; }; sleep 1
done
docker run --rm --name "$CHECK_NAME" --network "$NETWORK" --network-alias checker -v "$APP_ROOT:/app:ro" -e API_BASE=http://api:8080 -e TEST_DATABASE_URL='postgres://forge:forge-test-password@postgres/forge_test' "$TOOL_IMAGE" python3 backend-forge/tests/integration.py
MIGRATIONS=$(docker exec "$DB_NAME" psql -U forge -d forge_test -Atc 'SELECT count(*) FROM _sqlx_migrations WHERE success=true')
test "$MIGRATIONS" = 11
docker restart "$API_NAME" >/dev/null
ATTEMPT=0
until docker exec "$API_NAME" curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; do
    ATTEMPT=$((ATTEMPT + 1)); test "$ATTEMPT" -lt 60 || { docker logs "$DB_NAME"; docker logs "$API_NAME"; exit 1; }; sleep 1
done
MIGRATIONS=$(docker exec "$DB_NAME" psql -U forge -d forge_test -Atc 'SELECT count(*) FROM _sqlx_migrations WHERE success=true')
test "$MIGRATIONS" = 11
docker exec "$DB_NAME" psql -U forge -d postgres -c 'CREATE DATABASE forge_module_test'
docker run --rm --network "$NETWORK" -v "$APP_ROOT:/app:ro" -e BUILD_DIR=/tmp/forge-build -e DATABASE_URL='postgres://forge:forge-test-password@postgres/forge_module_test?connect_timeout=5' "$TOOL_IMAGE" sh -c 'sh backend-forge/scripts/build.sh && sh backend-forge/scripts/test-modules.sh'
python3 backend-forge/tests/proxy_security.py --api-image "$API_IMAGE"
python3 backend-forge/tests/health_batch_lifecycle.py --api-image "$API_IMAGE"
echo 'Forge server, migration restart, independent modules and proxy security passed'
