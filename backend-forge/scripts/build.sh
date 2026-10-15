#!/bin/sh
set -eu
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
FORGE_SOURCE=${FORGE_SOURCE:-"$APP_ROOT/backend-forge/toolchain"}
POSTGRES_SOURCE=${POSTGRES_SOURCE:-"$APP_ROOT/backend-forge/vendor/forge-postgres"}
WEB_SOURCE=${WEB_SOURCE:-"$APP_ROOT/backend-forge/vendor/forge-web"}
BUILD_DIR=${BUILD_DIR:-"$APP_ROOT/backend-forge/build"}
mkdir -p "$BUILD_DIR"
if [ "$FORGE_SOURCE" = "$APP_ROOT/backend-forge/toolchain" ]; then
    python3 "$APP_ROOT/scripts/update-forge-toolchain.py" --check
fi
cmake -S "$FORGE_SOURCE" -B "$BUILD_DIR/toolchain" -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF
cmake --build "$BUILD_DIR/toolchain" --target forge forge_std forge_runtime -j 4
SDK_ROOT="$BUILD_DIR/toolchain"
cmake -S "$POSTGRES_SOURCE" -B "$BUILD_DIR/postgres" -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD_DIR/postgres" -j 4
cmake -S "$WEB_SOURCE" -B "$BUILD_DIR/web" -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD_DIR/web" -j 4
"$BUILD_DIR/toolchain/bin/forge" "$APP_ROOT/backend-forge/src/main.fg" --emit-c -o "$BUILD_DIR/server.c" -I "$POSTGRES_SOURCE" -I "$WEB_SOURCE" --forge-root "$SDK_ROOT" --lib-dir "$SDK_ROOT/lib"
cat "$APP_ROOT/backend-forge/native/adapter.c" >> "$BUILD_DIR/server.c"
cc -std=gnu11 -O2 -Wall -Wextra -Wno-unused-function -Werror=implicit-function-declaration -Werror=incompatible-pointer-types -I "$SDK_ROOT/include" -I "$WEB_SOURCE/include" "$BUILD_DIR/server.c" -Wl,--start-group "$BUILD_DIR/postgres/libforge_postgres.a" "$BUILD_DIR/web/libforge_web.a" "$SDK_ROOT/lib/libforge_std.a" "$SDK_ROOT/lib/libforge_runtime.a" -Wl,--end-group $(pkg-config --cflags --libs libpq libmicrohttpd json-c libcurl openssl) -lpthread -lm -o "$BUILD_DIR/portfolio-api"
