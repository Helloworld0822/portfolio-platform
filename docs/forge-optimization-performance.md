# Forge optimization: Rust / before / after

Three repeats of five seconds, one-second warmup, 2 CPUs / 512 MiB per server, five DB connections, identical disposable fixtures. Three-way rotated order. Values are medians.

| API | Clients | Rust req/s | Before req/s | After req/s | After/before | After/Rust | Before p95 ms | After p95 ms | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| /api/health | 1 | 2541.59 | 922.09 | 1080.18 | 1.17x | 0.43x | 1.84 | 1.72 | 0 |
| /api/health | 16 | 7802.70 | 5451.18 | 5701.08 | 1.05x | 0.73x | 4.16 | 3.53 | 0 |
| /api/health | 64 | 7474.34 | 5493.17 | 5338.14 | 0.97x | 0.71x | 12.59 | 13.26 | 0 |
| /api/posts | 1 | 348.07 | 506.00 | 504.12 | 1.00x | 1.45x | 3.07 | 3.00 | 0 |
| /api/posts | 16 | 3675.31 | 3487.14 | 3453.08 | 0.99x | 0.94x | 9.34 | 9.67 | 0 |
| /api/posts | 64 | 3643.73 | 3549.84 | 3552.61 | 1.00x | 0.97x | 34.04 | 33.69 | 0 |
| /api/projects | 1 | 427.06 | 498.06 | 559.81 | 1.12x | 1.31x | 3.65 | 3.49 | 0 |
| /api/projects | 16 | 5447.37 | 4478.93 | 4549.48 | 1.02x | 0.84x | 5.43 | 5.56 | 0 |
| /api/projects | 64 | 5625.30 | 4663.99 | 4841.31 | 1.04x | 0.86x | 18.27 | 16.90 | 0 |

The production applications remained running on this shared host. Small differences can be host variation. Different worker/runtime/libc and ban-cache implementations prevent interpreting this as a universal language comparison. The Forge scheduler is not on this libmicrohttpd server path. CPU and memory samples are included in the raw JSON.

The Forge implementation retains PostgreSQL ban checks on every public request; the optimization releases DB leases before external HTTP and file work. A separate delayed-GitHub test covers the contention this change targets.

Post payload fields match after timestamp normalization and sorting equal-time posts by ID. Rust/Forge wire timestamp spellings and tie order can differ. Baseline portfolio commit: `5546fdc`; optimized compiler: `ba36611`; optimized Web module: `eb10d78`.
