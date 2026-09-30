# Pinned Forge compiler snapshot

Minimal compiler/runtime/standard-library sources from the local Forge repository
at ed0a3a6, including the reviewed September 30, 2026 fixes and migration support:
imported extern declarations, typed module string calls and module prototypes.
The original MIT license is retained. This source snapshot makes the migration
build reproducible while the upstream repository URL is unavailable. No Rust
runtime is used. Examples, benchmarks, editor tools and Lean files are excluded.

Compiler changes remain in the original Forge workspace as well. To refresh the
snapshot, review/copy compiler/, include/, runtime/ and stdlib/ together and rerun
compiler regressions and portfolio integration tests. Do not mix runtime ABIs.
