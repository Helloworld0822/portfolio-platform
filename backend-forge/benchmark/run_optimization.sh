#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT"
NETWORK=forge-opt-20261001
TEMP=$(mktemp -d /tmp/forge-opt-run.XXXXXX)
CREATED=''
NETWORK_CREATED=0
cleanup() {
 for name in $CREATED; do docker rm -f "$name" >/dev/null 2>&1 || true; done
 if [ "$NETWORK_CREATED" = 1 ]; then docker network rm "$NETWORK" >/dev/null 2>&1 || true; fi
 rm -rf "$TEMP"
}
trap cleanup EXIT INT TERM
for name in forge-opt-db forge-opt-rust forge-opt-before forge-opt-after; do
 if docker inspect "$name" >/dev/null 2>&1; then echo "Existing container: $name" >&2; exit 1; fi
done
if docker network inspect "$NETWORK" >/dev/null 2>&1; then echo "Existing benchmark network" >&2; exit 1; fi
if [ "${OPTIMIZATION_SKIP_BUILD:-0}" != 1 ]; then
 GIT_MASTER=1 git clone --no-checkout https://github.com/Helloworld0822/portfolio-platform.git "$TEMP/baseline"
 GIT_MASTER=1 git -C "$TEMP/baseline" checkout 5546fdc
 GIT_MASTER=1 git -C "$TEMP/baseline" submodule update --init --recursive
 docker build -t forge-opt-before:20261001 -f "$TEMP/baseline/backend-forge/Containerfile" "$TEMP/baseline"
 docker build -t forge-opt-after:20261001 -f backend-forge/Containerfile .
 docker build -t forge-compare-rust:local -f backend/Containerfile backend
fi
docker network create --label forge.optimization=20261001 "$NETWORK" >/dev/null
NETWORK_CREATED=1
docker run -d --name forge-opt-db --label forge.optimization=20261001 --network "$NETWORK" --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=bench -e POSTGRES_PASSWORD=benchmark-only -e POSTGRES_DB=rust_test postgres:16-alpine >/dev/null
CREATED='forge-opt-db'
ready=0
for wait in $(seq 1 60); do
 if docker exec forge-opt-db pg_isready -h 127.0.0.1 -U bench -d rust_test >/dev/null 2>&1; then ready=1; break; fi
 sleep 1
done
[ "$ready" = 1 ] || exit 1
for db in forge_before forge_after; do docker exec forge-opt-db createdb -U bench "$db"; done
for variant in rust before after; do
 case "$variant" in
 rust) port=18111; db=rust_test; image=forge-compare-rust:local ;;
 before) port=18112; db=forge_before; image=forge-opt-before:20261001 ;;
 after) port=18114; db=forge_after; image=forge-opt-after:20261001 ;;
 esac
 name="forge-opt-$variant"
 docker run -d --name "$name" --label forge.optimization=20261001 --network "$NETWORK" --cpus 2 --memory 512m -p "127.0.0.1:$port:8080" -e DATABASE_URL="postgres://bench:benchmark-only@forge-opt-db/$db" -e DATABASE_POOL_SIZE=5 -e JWT_SECRET=benchmark-only-test-secret -e GITHUB_CLIENT_ID=test -e GITHUB_CLIENT_SECRET=test -e ADMIN_GITHUB_USERNAME=Helloworld0822 -e FRONTEND_URL="http://localhost:$port" -e BACKEND_BASE_URL="http://localhost:$port" -e HOST=0.0.0.0 -e PORT=8080 -e RUST_LOG=off "$image" >/dev/null
 CREATED="$CREATED $name"
 ready=0
 for wait in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
 done
 [ "$ready" = 1 ] || { docker logs "$name"; exit 1; }
 docker exec -i forge-opt-db psql -U bench -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE comments,posts RESTART IDENTITY CASCADE;
INSERT INTO posts(title,content_markdown,excerpt,published,created_at,updated_at)
SELECT 'Post '||i,repeat('Benchmark body. ',20),'Same fixture',true,'2026-01-01'::timestamptz,'2026-01-01'::timestamptz FROM generate_series(1,100)i;
SQL
done
docker exec forge-opt-db pg_dump -U bench -d forge_before --data-only --table=public.projects > "$TEMP/projects.sql"
docker exec forge-opt-db psql -U bench -d forge_after -v ON_ERROR_STOP=1 -c 'TRUNCATE projects CASCADE'
docker exec -i forge-opt-db psql -U bench -d forge_after -v ON_ERROR_STOP=1 < "$TEMP/projects.sql"
PYTHON=${OPTIMIZATION_PYTHON:-python3}
"$PYTHON" backend-forge/benchmark/optimization_compare.py
