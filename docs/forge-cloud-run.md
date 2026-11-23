# Forge API opt-in for Cloud Run

The live implementation is the API image on the Cloud Run revision receiving
100% of traffic. The production ingress remains the existing React/nginx
image, which owns the host split, asset build and headers. Both APIs return
the same ordinary health JSON; do not infer the runtime from it.

1. After the exact main commit passes CI and Forge migration CI, manually run
   Deploy with `api_runtime=stage-forge`. This resolves or publishes the
   linux/amd64 Forge API image to Artifact Registry and prints its immutable
   digest. It does not create a Cloud Run revision or change traffic.
2. Verify that exact API digest and the production nginx configuration on an
   isolated authenticated Cloud Run service, disposable database and disposable
   GCS mount. Never stage writes in the live database or upload bucket. Exercise
   migrations from both fresh and current-version schema snapshots, GitHub OAuth
   callback/login, existing JWT claim compatibility, trusted proxy/client IP,
   per-IP/contact and comment budgets, bans/admin bypass, uploads/readback and
   cleanup, and root/portfolio/blog routes and static assets. Confirm all 11
   migrations are already applied before overlapping runtimes against live data;
   their migration locks differ. Recheck the actual running probe/sidecar
   configuration, not only the Docker health check. An interrupted OAuth flow
   may require a fresh login across a runtime switch.
3. If any check fails, keep the currently serving runtime. In particular,
   Forge's upload bridge currently uses `fsync`, `fchmod` and rename on the
   target path. Cloud Storage FUSE is not POSIX and the same-digest upload test
   on the actual staging mount is a release blocker, even when local filesystem
   tests pass. Preserve upload semantics rather than disabling validation.
4. With explicit rollout approval, run Deploy with `api_runtime=forge`,
   `forge_staging_commit` set to that exact main SHA and
   `forge_staging_digest` to the tested `sha256:…` value. Deploy validates the
   supplied evidence identifiers, but does not perform the isolated staging
   checks itself. It stages the candidate at zero traffic, checks revision
   readiness and exact container images, then switches traffic. The public
   read-only smoke and serving-revision checks automatically restore the
   prior revision on failure. Confirm selected runtime from the serving
   revision's image digest, not a generic health response.

Ordinary Deploy keeps the currently serving runtime. A different Forge API
digest will not be promoted automatically; repeat the isolated staging review.
The Deploy workflow's GitHub token only needs Actions/workflow metadata read.
Its existing Workload Identity principal needs Cloud Run service/revision
read and update, backup-job permissions, and Artifact Registry read/write for
the `forge-api` image in the existing repository. An isolated staging
caller must have invoker permission on staging; no staging token is required
or printed by this workflow. Live traffic returns to Rust with an explicitly
approved `api_runtime=rust` dispatch or the established revision rollback.

The Forge browser app is an alternate Compose build, not a drop-in
Cloud Run replacement. It lacks the current React home layout/assets and
multi-host navigation behavior. Keep React while validating those differences.
