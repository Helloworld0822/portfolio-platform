#!/bin/sh
set -eu
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
BUILD_DIR=${BUILD_DIR:-"$APP_ROOT/backend-forge/build"}
FORGE_SOURCE=${FORGE_SOURCE:-"$APP_ROOT/backend-forge/toolchain"}
POSTGRES_SOURCE=${POSTGRES_SOURCE:-"$APP_ROOT/backend-forge/vendor/forge-postgres"}
WEB_SOURCE=${WEB_SOURCE:-"$APP_ROOT/backend-forge/vendor/forge-web"}
cmake -S "$WEB_SOURCE" -B "$BUILD_DIR/web" -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD_DIR/web" -j 4
ctest --test-dir "$BUILD_DIR/web" --output-on-failure
for MODULE_NAME in postgres web; do
    if [ "$MODULE_NAME" = postgres ]; then MODULE_SOURCE="$POSTGRES_SOURCE/tests/integration.fg"; else MODULE_SOURCE="$WEB_SOURCE/tests/module.fg"; fi
    "$BUILD_DIR/toolchain/bin/forge" "$MODULE_SOURCE" -I "$POSTGRES_SOURCE" -I "$WEB_SOURCE" --emit-c -o "$BUILD_DIR/test-$MODULE_NAME.c" --forge-root "$FORGE_SOURCE" --lib-dir "$BUILD_DIR/toolchain/lib"
    cc -std=gnu11 -O2 -I "$FORGE_SOURCE/include" "$BUILD_DIR/test-$MODULE_NAME.c" "$BUILD_DIR/postgres/libforge_postgres.a" "$BUILD_DIR/web/libforge_web.a" "$BUILD_DIR/toolchain/lib/libforge_runtime.a" "$BUILD_DIR/toolchain/lib/libforge_std.a" $(pkg-config --libs libpq libmicrohttpd json-c libcurl openssl) -lpthread -lm -o "$BUILD_DIR/test-$MODULE_NAME"
    "$BUILD_DIR/test-$MODULE_NAME"
done
