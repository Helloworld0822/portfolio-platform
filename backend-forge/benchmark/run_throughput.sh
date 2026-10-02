#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT"
NETWORK=forge-throughput-20261001
TEMP=$(mktemp -d /tmp/forge-throughput-run.XXXXXX)
CREATED=''
NETWORK_CREATED=0
cleanup() {
 for name in $CREATED; do docker rm -f "$name" >/dev/null 2>&1 || true; done
 if [ "$NETWORK_CREATED" = 1 ]; then docker network rm "$NETWORK" >/dev/null 2>&1 || true; fi
 rm -rf "$TEMP"
}
trap cleanup EXIT INT TERM
for name in forge-throughput-db forge-throughput-rust forge-throughput-before forge-throughput-after; do
 if docker inspect "$name" >/dev/null 2>&1; then echo "Existing container: $name" >&2; exit 1; fi
done
if docker network inspect "$NETWORK" >/dev/null 2>&1; then echo "Existing benchmark network" >&2; exit 1; fi
# The frozen baseline tag must exist. It is deliberately never built/retagged here.
docker image inspect forge-throughput-baseline:bc61821-20261001 >/dev/null
BASELINE_EXPECTED_ID=sha256:db6a144d3184f1da1eb0f5e7a3020e9531af8c75f177d71a1cfd44aedf951ed7
BASELINE_ACTUAL_ID=$(docker image inspect --format '{{.Id}}' forge-throughput-baseline:bc61821-20261001)
[ "$BASELINE_ACTUAL_ID" = "$BASELINE_EXPECTED_ID" ] || { echo "Frozen baseline image changed" >&2; exit 1; }
if [ "${THROUGHPUT_SKIP_BUILD:-0}" != 1 ]; then
 docker build -t forge-throughput-after:20261001 -f backend-forge/Containerfile .
 docker build -t forge-compare-rust:local -f backend/Containerfile backend
fi
docker network create --label forge.throughput=20261001-throughput "$NETWORK" >/dev/null
NETWORK_CREATED=1
docker run -d --name forge-throughput-db --label forge.throughput=20261001-throughput --network "$NETWORK" --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=bench -e POSTGRES_PASSWORD=benchmark-only -e POSTGRES_DB=rust_test postgres:16-alpine >/dev/null
CREATED='forge-throughput-db'
ready=0
for wait in $(seq 1 60); do
 if docker exec forge-throughput-db pg_isready -h 127.0.0.1 -U bench -d rust_test >/dev/null 2>&1; then ready=1; break; fi
 sleep 1
done
[ "$ready" = 1 ] || exit 1
for db in forge_before forge_after; do docker exec forge-throughput-db createdb -U bench "$db"; done
for variant in rust before after; do
 case "$variant" in
 rust) port=18211; db=rust_test; image=forge-compare-rust:local ;;
 before) port=18212; db=forge_before; image=forge-throughput-baseline:bc61821-20261001 ;;
 after) port=18214; db=forge_after; image=forge-throughput-after:20261001 ;;
 esac
 name="forge-throughput-$variant"
 docker run -d --name "$name" --label forge.throughput=20261001-throughput --network "$NETWORK" --cpus 2 --memory 512m -p "127.0.0.1:$port:8080" -e DATABASE_URL="postgres://bench:benchmark-only@forge-throughput-db/$db" -e DATABASE_POOL_SIZE=5 -e JWT_SECRET=benchmark-only-test-secret -e GITHUB_CLIENT_ID=test -e GITHUB_CLIENT_SECRET=test -e ADMIN_GITHUB_USERNAME=Helloworld0822 -e FRONTEND_URL="http://localhost:$port" -e BACKEND_BASE_URL="http://localhost:$port" -e HOST=0.0.0.0 -e PORT=8080 -e RUST_LOG=off "$image" >/dev/null
 CREATED="$CREATED $name"
 ready=0
 for wait in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
 done
 [ "$ready" = 1 ] || { docker logs "$name"; exit 1; }
 docker exec -i forge-throughput-db psql -U bench -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE comments,posts RESTART IDENTITY CASCADE;
INSERT INTO posts(title,content_markdown,excerpt,published,created_at,updated_at)
SELECT 'Post '||i,repeat('Benchmark body. ',20),'Same fixture',true,'2026-01-01'::timestamptz,'2026-01-01'::timestamptz FROM generate_series(1,100)i;
SQL
done
docker exec forge-throughput-db pg_dump -U bench -d forge_before --data-only --table=public.projects > "$TEMP/projects.sql"
docker exec forge-throughput-db psql -U bench -d forge_after -v ON_ERROR_STOP=1 -c 'TRUNCATE projects CASCADE'
docker exec -i forge-throughput-db psql -U bench -d forge_after -v ON_ERROR_STOP=1 < "$TEMP/projects.sql"
PYTHON=${THROUGHPUT_PYTHON:-python3}
export THROUGHPUT_AFTER_REVISION=$($PYTHON -c 'import os,subprocess; print(subprocess.check_output(["git","rev-parse","HEAD"], env={**os.environ,"GIT_MASTER":"1"}, text=True).strip()+"+working-tree")')
export THROUGHPUT_POSTGRES_REVISION=$(GIT_MASTER=1 git -C backend-forge/vendor/forge-postgres rev-parse HEAD)
export THROUGHPUT_WEB_REVISION=$(GIT_MASTER=1 git -C backend-forge/vendor/forge-web rev-parse HEAD)
export THROUGHPUT_SOURCE_SHA256=$($PYTHON - <<'PY'
import hashlib
from pathlib import Path
root = Path.cwd()
files = [*sorted((root / 'backend-forge/src').glob('*.fg')),
         root / 'backend-forge/native/adapter.c']
for module, names in {
    'forge-postgres': ['CMakeLists.txt', 'postgres.fg', 'include/forge_postgres.h', 'src/bridge.c'],
    'forge-web': ['CMakeLists.txt', 'web.fg', 'include/forge_web.h', 'src/bridge.c'],
}.items():
    files.extend(root / 'backend-forge/vendor' / module / name for name in names)
hash_value = hashlib.sha256()
for path in sorted(files):
    hash_value.update(str(path.relative_to(root)).encode())
    hash_value.update(b'\0')
    hash_value.update(path.read_bytes())
    hash_value.update(b'\0')
print(hash_value.hexdigest())
PY
)
"$PYTHON" backend-forge/benchmark/throughput_compare.py
