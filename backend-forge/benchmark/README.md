# Reproduce API measurements

## Language update comparison

`toolchain_compare.py` compares the same Forge app before and after a compiler,
runtime and stdlib update. Freeze the old image before updating the bundle:

```sh
docker build -f backend-forge/Containerfile -t portfolio-forge-before:local .
python3 scripts/update-forge-toolchain.py --revision <compiler-commit-or-tag>
sh backend-forge/scripts/test-integration.sh
docker build -f backend-forge/Containerfile -t portfolio-forge-after:local .
docker build -f frontend-forge/Containerfile -t portfolio-forge-frontend:local .
python3 -m venv /tmp/portfolio-benchmark-env
/tmp/portfolio-benchmark-env/bin/pip install -r backend-forge/benchmark/requirements.txt
/tmp/portfolio-benchmark-env/bin/python backend-forge/benchmark/test_toolchain_compare.py
/tmp/portfolio-benchmark-env/bin/python backend-forge/benchmark/toolchain_compare.py \
  --before-image portfolio-forge-before:local --after-image portfolio-forge-after:local \
  --frontend-image portfolio-forge-frontend:local \
  --output docs/forge-toolchain-performance-NEW-DATE.json
```

The optional frontend step runs existing Playwright tests before timing, using
only the disposable API and fixed test credentials. Install frontend npm
dependencies and the matching Playwright Chromium beforehand. The DB fixtures
are reset afterwards and nginx is stopped before measurements.

The default experiment uses six balanced before/after pairs, one-second prewarms
and three-second measurements for health, post summaries and projects at
configured concurrency 1/16/64/256. Each app has two pinned physical cores and
512 MiB, the disposable DB has two other physical cores and tmpfs storage, and
the shared aiohttp observer has a fifth core. All measured and prewarm request
latencies/status/errors are gzip JSON files. Every response is parsed and checked
against identical fixtures; incorrect nonempty HTTP 200 bodies fail validation.
Errors, timeouts and slow samples remain in the results. Existing output paths
are refused. No `.env`, production DB, production containers or existing Docker
volumes are used. Only newly created resources are cleaned up.

Compare paired ratios and uncertainty alongside p99, cgroup CPU and sampled
cgroup memory. A configured concurrency of 256 is not 256 proven users, and
passing one test point does not establish absolute capacity. Shared-host noise,
JSON validation in Python and synchronous DB/native libraries can constrain the
result. Native language microbenchmark gains do not guarantee application gains.

## Earlier API measurements

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

The before/after/Rust comparison is `sh backend-forge/benchmark/run_optimization.sh`.
It builds baseline portfolio commit `5546fdc`, the current Forge app and the current
Rust app, then creates labeled private containers/databases and identical Forge
project/post fixtures. It uses ports 18111, 18112 and 18114, rotates three variants
per repeat, and refuses existing benchmark container names. Results are written
to `docs/forge-optimization-performance.{json,md}`. Cleanup only removes resources
created by this script. `OPTIMIZATION_PYTHON` may select a Python with aiohttp;
`OPTIMIZATION_SKIP_BUILD=1` reuses those exact named local benchmark images.
