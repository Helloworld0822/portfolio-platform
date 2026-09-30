# Reproduce API measurements

`sh backend-forge/benchmark/run.sh` builds both apps from the checkout, creates a
private disposable PostgreSQL instance, waits for migrations, seeds identical
100-post fixtures and runs warmups plus 3 x 5-second measurements for each
endpoint/concurrency. Requires Docker, curl, Python/venv and internet for builds.
Uses loopback ports 18111/18112; override RUST_PORT/FORGE_PORT if in use.
The script never loads .env or connects to production. Containers/network are
removed on exit. Raw results and their derived Markdown table are under docs/.
Generated benchmark images are retained for inspection.

For application build timing, first build named builder images:

```sh
docker build --target builder -t forge-compare-rust-toolchain:local -f backend/Containerfile backend
docker build --target builder -t forge-compare-forge-toolchain:local -f backend-forge/Containerfile .
python3 backend-forge/benchmark/build_compare.py
```

Release application artifacts are removed/rebuilt while dependency artifacts
remain available. Rust thin LTO and Forge -O2 are different policies, so timings
are not a controlled compiler benchmark. Run on an idle dedicated machine for
release-grade conclusions. The initial measurements used an otherwise active
shared AMD BC-250 host.
