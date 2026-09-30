# Portfolio API in Forge

The HTTP routing, validation, authorization, OAuth flow and SQL orchestration are
implemented in `src/*.fg`. `native/adapter.c` connects the compiled Forge handler
to the HTTP callback and resets the Forge string arena after each request.

Dependencies are pinned Git submodules:

- [forge-postgres](https://github.com/Helloworld0822/forge-postgres): Forge database
  API, transactions and SQLx-compatible migrations; libpq FFI and bounded pool.
- [forge-web](https://github.com/Helloworld0822/forge-web): Forge HTTP/JSON helpers,
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
uses fixed test credentials, publishes no ports and removes its containers/network
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

Five exclusive database connections, eight HTTP workers, 256 concurrent client
connections, 5-second query timeout, 3-second lock timeout, 5-second PostgreSQL
connection timeout, 2 MiB JSON body, 20 MiB file and 25 MiB multipart request.
GitHub account language fetches use four workers and up to three pages of repos.
The server uses synchronous native workers. It does not depend on unfinished
Forge coroutine scheduling or supervisor recovery.
