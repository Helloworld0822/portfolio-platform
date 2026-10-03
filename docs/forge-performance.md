# Rust / Forge portfolio API performance

Measured: 2026-09-30T07:39:57Z; AMD BC-250.

2 CPU cores / 512 MiB per app; PostgreSQL pool 5; 3 repeats of 5 seconds after warmup. Identical seeded database fixtures; HTTP keep-alive without compression. Values are medians of runs.

| Endpoint | Clients | Rust req/s | Forge req/s | Forge/Rust | Rust p95 ms | Forge p95 ms | Rust MiB | Forge MiB | Errors (R/F) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| /api/health | 1 | 2213.02 | 1090.54 | 0.49x | 0.68 | 1.69 | 4.63 | 4.32 | 0/0 |
| /api/health | 16 | 7828.17 | 5506.99 | 0.70x | 2.84 | 4.55 | 5.07 | 5.21 | 0/0 |
| /api/health | 64 | 7601.11 | 5520.29 | 0.73x | 11.11 | 12.23 | 5.81 | 11.74 | 0/0 |
| /api/posts | 1 | 316.24 | 503.77 | 1.59x | 4.73 | 3.06 | 6.01 | 3.3 | 0/0 |
| /api/posts | 16 | 3694.41 | 3482.78 | 0.94x | 6.91 | 8.58 | 6.71 | 6.06 | 0/0 |
| /api/posts | 64 | 3745.56 | 3629.27 | 0.97x | 32.17 | 34.26 | 9.06 | 12.35 | 0/0 |
| /api/projects | 1 | 506.11 | 499.48 | 0.99x | 3.19 | 3.35 | 7.72 | 3.58 | 0/0 |
| /api/projects | 16 | 5371.75 | 4428.45 | 0.82x | 4.34 | 5.24 | 8.27 | 6.56 | 0/0 |
| /api/projects | 64 | 5477.54 | 4832.89 | 0.88x | 16.75 | 17.68 | 8.56 | 12.87 | 0/0 |

CPU values and every raw run are in forge-performance.json. Container memory includes native libraries and caches; it is not allocated heap alone.

This measures these implementations on one shared host, not Rust versus Forge in general. The Python load generator, Actix automatic worker count, synchronous Forge libpq calls and different libc bases limit causal interpretation. Production stacks remain running; repeat on an otherwise idle dedicated host for release decisions.

The Forge implementation checks IP bans in PostgreSQL on every public request; Rust caches bans in memory. Database-heavy endpoints may therefore favor Rust independently of compiler quality. Do not remove safety checks merely to improve benchmark numbers.

## Application rebuild

Warm dependency builds, application sources rebuilt with 2 CPU limit. Median of three runs, including container start and clean.

- rust: 97.156 seconds.
- forge: 1.455 seconds.

Rust uses thin LTO; Forge emits C and compiles at -O2. Toolchain and dependency builds are excluded, so this does not compare clean ecosystem build times.
