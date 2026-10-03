#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT"
PROJECT="forge-perf-$$"
RUST_PORT=${RUST_PORT:-18111}
FORGE_PORT=${FORGE_PORT:-18112}
cleanup(){ docker rm -f "$PROJECT-rust" "$PROJECT-forge" "$PROJECT-db" >/dev/null 2>&1 || true; docker network rm "$PROJECT" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Build from this checkout; do not reuse production images/databases.
docker build -t "$PROJECT-rust" -f backend/Containerfile backend
docker build -t "$PROJECT-forge" -f backend-forge/Containerfile .
docker network create "$PROJECT" >/dev/null
docker run -d --name "$PROJECT-db" --network "$PROJECT" --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_USER=bench -e POSTGRES_PASSWORD=benchmark-only -e POSTGRES_DB=rust_test postgres:16-alpine >/dev/null
ready=0
for wait in $(seq 1 60); do if docker exec "$PROJECT-db" pg_isready -h 127.0.0.1 -U bench -d rust_test >/dev/null 2>&1; then ready=1; break; fi; sleep 1; done
[ "$ready" = 1 ] || exit 1
docker exec "$PROJECT-db" createdb -h 127.0.0.1 -U bench forge_test
for lang in rust forge; do
 port=$RUST_PORT; db=rust_test; if [ "$lang" = forge ]; then port=$FORGE_PORT; db=forge_test; fi
 docker run -d --name "$PROJECT-$lang" --network "$PROJECT" --cpus 2 --memory 512m -p "127.0.0.1:$port:8080" -e DATABASE_URL="postgres://bench:benchmark-only@$PROJECT-db/$db" -e JWT_SECRET=benchmark-only-test-secret -e GITHUB_CLIENT_ID=test -e GITHUB_CLIENT_SECRET=test -e ADMIN_GITHUB_USERNAME=Helloworld0822 -e FRONTEND_URL="http://localhost:$port" -e BACKEND_BASE_URL="http://localhost:$port" -e HOST=0.0.0.0 -e PORT=8080 -e RUST_LOG=off "$PROJECT-$lang" >/dev/null
 ready=0
 for wait in $(seq 1 60); do if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null; then ready=1; break; fi; sleep 1; done
 [ "$ready" = 1 ] || exit 1
 docker exec -i "$PROJECT-db" psql -U bench -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE comments,posts RESTART IDENTITY CASCADE;
INSERT INTO posts(title,content_markdown,excerpt,published,created_at,updated_at)
SELECT 'Post '||i,repeat('Benchmark body. ',20),'Same fixture',true,'2026-01-01'::timestamptz,'2026-01-01'::timestamptz FROM generate_series(1,100)i;
SQL
done
python3 -m venv /tmp/"$PROJECT-env"
/tmp/"$PROJECT-env"/bin/pip install -q aiohttp
RUST_BENCH_BASE="http://127.0.0.1:$RUST_PORT" FORGE_BENCH_BASE="http://127.0.0.1:$FORGE_PORT" RUST_BENCH_CONTAINER="$PROJECT-rust" FORGE_BENCH_CONTAINER="$PROJECT-forge" /tmp/"$PROJECT-env"/bin/python backend-forge/benchmark/compare.py
