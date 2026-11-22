# Portfolio application: pinned Forge toolchain update

The same committed Forge application, PostgreSQL/web modules, -O2 C policy and disposable DB fixtures are compared using the old monolithic toolchain and the new compiler/runtime/stdlib bundle. Six balanced before/after pairs per row, three seconds measured after one-second prewarm; all attempts and errors are retained. CPU, network, load generator and database conditions are in JSON.

| API | Configured clients | Before req/s | After req/s | Paired after/before (95% interval) | Before p99 ms | After p99 ms | Errors before/after |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| /api/health | 1 | 1391.7 | 1471.4 | 0.960 [0.812, 1.176] | 3.61 | 3.79 | 0/0 |
| /api/health | 16 | 6576.2 | 6273.7 | 0.913 [0.852, 1.022] | 4.63 | 5.73 | 0/0 |
| /api/health | 64 | 6342.3 | 6258.6 | 0.960 [0.905, 1.015] | 16.70 | 16.51 | 0/0 |
| /api/health | 256 | 5162.8 | 5011.1 | 0.992 [0.952, 1.037] | 90.54 | 94.12 | 0/0 |
| /api/posts | 1 | 532.9 | 530.0 | 1.008 [0.909, 1.088] | 5.06 | 5.26 | 0/0 |
| /api/posts | 16 | 3038.1 | 3071.0 | 1.033 [0.941, 1.070] | 8.85 | 9.07 | 0/0 |
| /api/posts | 64 | 2849.0 | 2941.7 | 1.030 [0.984, 1.109] | 35.74 | 34.22 | 0/0 |
| /api/posts | 256 | 2547.0 | 2599.8 | 0.992 [0.961, 1.050] | 153.63 | 144.52 | 0/0 |
| /api/projects | 1 | 684.4 | 682.8 | 0.927 [0.891, 1.027] | 4.85 | 4.90 | 0/0 |
| /api/projects | 16 | 3718.7 | 3801.8 | 1.049 [0.960, 1.061] | 7.48 | 6.96 | 0/0 |
| /api/projects | 64 | 3696.1 | 3682.7 | 0.998 [0.952, 1.096] | 27.06 | 28.20 | 0/0 |
| /api/projects | 256 | 3488.1 | 3452.3 | 0.995 [0.875, 1.012] | 112.00 | 106.87 | 0/0 |

Configured clients and peak client in-flight operations are closed-loop observer counts, not a census of simultaneous TCP sockets or users. The server's connection limit is 256. A tested concurrency passing p99 <= 1 second and zero errors is a finite SLO observation; it is not the absolute maximum user population.

The single aiohttp observer decodes and compares the full JSON payload on every request. These client costs, synchronous native PostgreSQL/libmicrohttpd behavior and active production services on the shared host limit interpretation. Rust and the language's native epoll benchmark are not controls in this application comparison. No Rust 110% claim follows from these results. Intervals are individual bootstrap paired-median intervals from six pairs, not family-wise guarantees or universal language speedups.

Every prewarm and measured latency/status/error sample is retained. Trial throughput counts successful requests over the actual elapsed interval including draining requests past the dispatch deadline, session close, JSON validation and memory sampling; later gzip sample writing is excluded. CPU is cgroup usage divided by wall time, where 100% is one core. Memory is sampled cgroup usage including native libraries and page caches, not allocated heap. Fixtures, image IDs, toolchain lock, source hashes and raw-file hashes are in JSON.

This run uses only uniquely labeled disposable containers and tmpfs databases, publishes random loopback ports, never reads .env and removes only resources it creates. Frontend E2E, if requested, runs before fixture reset and timing; the frontend container is then stopped. No production deployment is performed.

All 12 paired intervals contain 1: no significant application throughput improvement was established; this is not an equivalence test. All 1,899,921 prewarm/measured requests passed payload validation with zero errors.

After timing, only the bundle fingerprint format and image revision metadata were finalized. All compiler/runtime/stdlib source files match the measured bundle, and final API executable and frontend JavaScript hashes equal the tested versions. Final images include inspectable toolchain manifests. One later build log was truncated by disk exhaustion; authoritative image IDs, successful process exits and manifest/binary equality checks are retained.

[Every request, fixture, source snapshot, binary, dependency revision and validation log](forge-toolchain-performance-2026-10-15.raw.tar.gz), SHA-256 `c069d1df92a028ea0d46b80c3afdba9c939482a91a59056c62fa89f076f61512`.
