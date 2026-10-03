# Forge server throughput: Rust / current baseline / optimized

Measured 2026-10-02T01:02:32Z. 3 repeats of 5 seconds with 1-second warmup, 2 CPUs / 512 MiB per server, five DB connections, identical disposable fixtures. Three-way rotated order. Values are medians.

Baseline application: `bc61821` (code `43871d3`), image `forge-throughput-baseline:bc61821-20261001`. Optimized application: `bc61821773164ef6e758131e623d52d10906766f+working-tree`, source SHA-256 `1740ddf421188c018d695cd40f85a828d9a2623647918bbea6f4c3dc36925674`. Container image IDs are in JSON.

| API | Clients | Rust req/s | Before req/s | After req/s | After/before | After/Rust | Before p95 ms | After p95 ms | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| /api/health | 1 | 2569.46 | 875.35 | 1216.37 | 1.39x | 0.47x | 1.91 | 1.30 | 0 |
| /api/health | 16 | 7906.74 | 5576.24 | 6509.35 | 1.17x | 0.82x | 3.51 | 3.51 | 0 |
| /api/health | 64 | 7560.01 | 5359.95 | 6476.35 | 1.21x | 0.86x | 12.96 | 11.54 | 0 |
| /api/posts | 1 | 396.91 | 514.87 | 540.92 | 1.05x | 1.36x | 2.98 | 2.83 | 0 |
| /api/posts | 16 | 3608.34 | 3253.10 | 3173.88 | 0.98x | 0.88x | 10.70 | 10.51 | 0 |
| /api/posts | 64 | 3578.83 | 3524.34 | 5189.52 | 1.47x | 1.45x | 34.31 | 25.71 | 0 |
| /api/projects | 1 | 427.42 | 541.09 | 754.66 | 1.39x | 1.77x | 3.43 | 2.58 | 0 |
| /api/projects | 16 | 5242.20 | 4419.64 | 5234.67 | 1.18x | 1.00x | 5.20 | 5.00 | 0 |
| /api/projects | 64 | 5547.41 | 4778.95 | 5918.10 | 1.24x | 1.07x | 16.91 | 18.76 | 0 |

Production applications remained running on this shared host. Small differences can be host variation. The Python aiohttp load generator can constrain high-throughput endpoints. Different worker/runtime/libc implementations prevent interpreting this as a universal language comparison. Rust also keeps IP bans in memory while both Forge versions read the live PostgreSQL ban table. The Rust comparison therefore includes different ban-cache semantics. The Forge scheduler is not on this libmicrohttpd server path. CPU and memory samples are in the raw JSON.

Both Forge variants retain immediate PostgreSQL ban checks. The new implementation combines the ban EXISTS gate and public endpoint data in one SQL command, reducing round trips without caching bans or response data. PostgreSQL prepared statements cache SQL plans only, bounded per connection. The web bridge reuses request metadata and enables epoll with a fallback when unavailable. The previous baseline already used PostgreSQL JSON aggregation. This combined benchmark does not isolate each optimization individually. Results vary by workload: `/api/posts` at 16 clients is about 2% below baseline, and `/api/projects` at 64 clients has a higher p95 despite higher throughput. The table and raw runs retain those tradeoffs.

All Forge payloads must match exactly; Rust post fields must match after timestamp normalization and sorting equal-time posts by ID. Rust/Forge health envelopes and project seed UUIDs can differ. Compiler: `ba36611f92fdd444a4c29827d9020e8bcff05dde`; PostgreSQL: `bfbd96e51f8f7c784ab014f1bd7895ec1b7622e4`; Web: `7e2684df4c2db9612e3da38de83ea0571fcd75e8`.
