# Portfolio API in Forge

The HTTP routing, validation, authorization, OAuth flow and SQL orchestration are
implemented in `src/*.fg`. `native/adapter.c` connects the compiled Forge handler
to the HTTP callback and resets the Forge string arena after each request.

Dependencies are pinned Git submodules:

- [forge-postgres](https://github.com/forge-language/forge-postgres): Forge database
  API, transactions and SQLx-compatible migrations; libpq FFI and bounded pool.
- [forge-web](https://github.com/forge-language/forge-web): Forge HTTP/JSON helpers,
  validation, JWT, bounded uploads and HTTP clients; native library FFI.

`toolchain/` pins the required Forge compiler/runtime source. Imported extern
functions, module call statements, forward declarations, typed string calls and
string escapes were implemented as part of this migration. POSIX workers release
their string arenas when they exit.

## Build and test

Initialize dependencies:

```sh
GIT_MASTER=1 git submodule update --init --recursive
```

Build the runnable container from the repository root:

```sh
docker build -f backend-forge/Containerfile -t portfolio-platform-forge-api:latest .
```

Run the complete disposable database, HTTP and module test suite:

```sh
sh backend-forge/scripts/test-integration.sh
```

The test script creates uniquely named containers and a PostgreSQL tmpfs database,
uses fixed test credentials, publishes only temporary loopback ports for proxy and
health lifecycle checks, and removes its containers/network
and image tags on exit. It verifies all existing migration versions, restarts the
server to verify migration idempotence, tests both independent `.fg` modules and
exercises the HTTP APIs with a mock GitHub service. It never reads `.env`.

For a host build, install C11/CMake/pkg-config, libpq, libmicrohttpd, json-c,
libcurl, OpenSSL and pthread development libraries, then run:

```sh
sh backend-forge/scripts/build.sh
DATABASE_URL='postgres://user:password@localhost/test_db' JWT_SECRET=dev-secret \
  backend-forge/build/portfolio-api
```

Run the binary from the repository root so it can read `backend/migrations/`,
`backend-forge/openapi.json` and `backend-forge/docs.html`. The container sets this
layout automatically. DATABASE_URL and JWT_SECRET are mandatory. Existing OAuth,
CORS, host/port and upload environment variable names are preserved.
`DATABASE_POOL_SIZE` defaults to 5 and accepts 1–64; invalid sizes fail startup.
DB leases are returned before OAuth/GitHub HTTP calls and detached file handlers.
Public requests still query IP bans, preserving immediate ban/unban behavior.
Non-admin `GET /api/health` requests check the current PostgreSQL ban and expiry
state. Concurrent checks share a query for up to 64 IPs, with a separate result
for each request. Each batch immediately selects queued requests before querying
the current DB state. Responses keep
the existing JSON, CORS and administrator bypass behavior. Queued checks time
out after 10 seconds with 503; selected checks finish their DB work before their
callbacks return. Database errors fail closed and terminate pending checks,
while subsequent requests query the database again.
The integration suite uses one connection to verify health remains available
while a GitHub request is deliberately delayed.
Post summaries are serialized in the API from typed DB columns, retaining the
live ban check in the same SQL statement and the existing timestamp format.
Comment counts use the joined post ID, allowing the existing post/date index
to cover the aggregate without reading comment IDs.

## Migration and rollback

Use the Compose override after reviewing and testing the change:

```sh
docker compose -f docker-compose.yml -f docker-compose.forge.yml build api
```

Switching the live stack requires an explicit deployment; this branch does not
change the default Rust Compose build or deployment workflow. See
[the migration report](../docs/forge-migration.md) for the rollout and rollback
commands, behavior differences and validation results.

The existing PostgreSQL tables, numbered migrations, upload volume and frontend
API shapes are preserved. No Rust runtime is linked into the Forge server. The
PostgreSQL protocol, HTTP parser and cryptography use maintained native libraries
through FFI; this is not a pure Forge implementation of those low-level protocols.

## Runtime bounds

Five exclusive database connections, up to 256 client connections with one HTTP
thread per connection, 5-second query timeout, 3-second lock timeout, 5-second PostgreSQL
connection timeout, 2 MiB JSON body, 20 MiB file and 25 MiB multipart request.
GitHub account language fetches use four workers and up to three pages of repos.
The server uses synchronous native workers. It does not depend on unfinished
Forge coroutine scheduling or supervisor recovery.

`FORGE_WEB_THREADS=connection` is the default: a blocking DB or outbound call
does not block unrelated connections on the same HTTP poller. `pool` restores
the previous eight shared HTTP workers. Idle keepalive connections retain their
threads and thread-local caches until disconnect or the 30-second inactivity
timeout. Application buffers and helper threads are additional to the HTTP
connection bound; the database pool still limits simultaneous queries.
Connection mode uses poll/select; an epoll request falls back to a supported
mode and the actual mode appears in startup logs. Migration 11 restores the
comment post/date index lost during the numeric post-ID migration.

## Trusted proxies and input limits

`FORGE_TRUSTED_PROXIES` defaults to empty: `X-Real-IP` is ignored unless the
direct socket peer matches the explicit comma-separated IP/CIDR allowlist. The
Forge Compose override uses a dedicated network and trusts only nginx's fixed
IP. Set `FORGE_PROXY_SUBNET` and `FORGE_PROXY_IP` together if its default
`172.28.243.0/29` overlaps another network. The disposable test suite allows its
own isolated subnet so it can exercise forwarded IPv4 and IPv6 identities.

The Forge nginx configuration ignores client-supplied `CF-Connecting-IP`.
For Cloudflare Tunnel, configure nginx `set_real_ip_from` with the exact tunnel
peer and `real_ip_header CF-Connecting-IP` before deploying. Loopback binding
alone does not establish that every socket peer is a trusted tunnel.

Contact fields are bounded to name 200 characters, email 254 bytes and message
10,000 characters. The request budget is 20 per IP per 10 minutes, in addition to
the existing five per IP/email pair. Invalid fields are rejected before either
budget is consumed. JSON keys must be unique; decoded NUL characters are
rejected because the current Forge string ABI uses C strings.
