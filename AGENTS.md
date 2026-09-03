# AGENTS.md

Guidance for AI agents working in this repository.

## Project overview

Self-hosted portfolio + blog platform. React 19 + TypeScript + Vite + Tailwind 4
frontend, Rust + Actix-web 4 + bb8/tokio-postgres backend, nginx gateway,
PostgreSQL 16, deployed with Compose on a Raspberry Pi behind a Cloudflare
Tunnel. Two public hostnames share one stack:

- **portfolio.helloworld0822.site** — `GET /`: portfolio home sections
- **blog.helloworld0822.site** — `GET /blog*`: blog list + posts

Host detection lives in `frontend/src/lib/site.ts` (`isBlogHost` /
`isPortfolioHost`); on the portfolio host, `/blog*` routes redirect to the blog
host.

## Layout

| Path | What |
| --- | --- |
| `backend/` | Rust API (`portfolio-blog-api`), migrations in `backend/migrations/` |
| `frontend/` | React app (Vite dev server, `npm run dev`) |
| `nginx/` | Reverse proxy `nginx.conf` — `/api/` and `/uploads/` → api, everything else → frontend |
| `docker-compose.yml` | nginx + frontend + api + postgres |
| `.env` (not committed) | Secrets + runtime config; `.env.example` is the template |
| `.github/workflows/ci.yml` | fmt/clippy/test + npm lint/build + compose validation |
| `.github/workflows/deploy.yml` | SSH deploy to the Pi (requires repo secrets) |

## Local development

Backend (Postgres-only via Compose):

```bash
docker compose up -d postgres
cd backend
export DATABASE_URL=postgres://blog:blog@localhost:5432/portfolio_blog
export JWT_SECRET=dev-secret GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=x \
       ADMIN_GITHUB_USERNAME=Helloworld0822 \
       FRONTEND_URL=http://localhost:5173/ BACKEND_BASE_URL=http://localhost:8080
cargo run   # http://localhost:8080
```

Frontend:

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

Migrations auto-apply on backend startup (`backend/migrations/`).

## Testing

Backend:

```bash
cd backend
cargo test --lib                 # no DB needed
# integration tests each create a throwaway test_<uuid> DB; needs Postgres up
export DATABASE_URL=postgres://blog:blog@localhost:5432/portfolio_blog
cargo test
cargo clippy --all-targets -- -D warnings
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

## Deployment (Raspberry Pi)

Production host uses **podman-compose** (NOT docker). Key gotchas:

1. **podman storage is vfs** → image builds are very slow. Be patient; prefer
   reuse over rebuilds when only source changed.
2. Images are built locally as `portfolio-platform-{nginx,frontend,api}:latest`.
3. After rebuilding api/frontend, nginx can serve stale upstream DNS → 502.
   Fix: `podman-compose up -d --force-recreate nginx`
   (or `podman start portfolio-platform_nginx_1` if compose leaves it `Created`).
4. `docker-compose` v5.5.0 on the Pi FAILS (no Docker socket) — always use
   `podman-compose` there.
5. Cloudflare Tunnel (`~/.cloudflared/config.yml`, tunnel `opencode-tunnel`)
   maps both domains to localhost:80.
6. Uploaded files persist in an `uploads-data` volume mounted at
   `/app/uploads` — container recreation does not lose them.
7. OAuth creds and secrets live only in the server `.env`; never commit `.env`.

## Rules / conventions

- **Never commit `.env`** — secrets (JWT, OAuth, tunnel) are server-side only.
- Comment/docstring hook active in this repo: for every newly added comment,
  (1) keep pre-existing comments, (2) keep BDD/Gherkin in tests, (3) keep
  comments required for security/complex logic, (4) otherwise remove the new
  comment and justify.
- `erl_crash.dump` at repo root is an untracked artifact — do not commit it.
- Every git command MUST be prefixed `GIT_MASTER=1` (git-master skill hooks).
  Commit style: PLAIN, English messages, multiple logical commits.
- Repo has no `AGENTS.md` example to copy; keep this file current when layout
  or workflows change.
- Backend: `AppError` (thiserror) is the error enum; add `From` impls (io →
  `anyhow::Error` → `Internal`) rather than widening `AppError` itself.
- Cargo deps live in `backend/Cargo.toml`; new crates need a CI-clean
  `cargo build` + `cargo fmt` + `cargo clippy`.
- Frontend styles are Tailwind 4 (`@theme` tokens in `src/index.css`); no
  tailwind.config file.

## Repo metadata enrichment, uploads & admin extras (recent features)

- `backend/src/github_repo.rs`: `fetch_repo_meta()` best-effort calls the GitHub
  API (languages + `private`) for a project's `url`. Uses
  `GITHUB_TOKEN` when set; never fails the request — falls back to defaults.
  `fetch_user_repos()` lists the admin's repos (org-owned included) for the
  project importer; `github_client()` builds the shared reqwest client with the
  GitHub-mandated User-Agent.
- `backend/src/routes/uploads.rs`: `POST /api/admin/uploads` multipart upload
  (png/jpg/jpeg/gif/webp/svg/pdf, 20MB cap) → `/uploads/{uuid}.{ext}`,
  served by actix-files. Requires admin JWT.
- `backend/src/routes/timeline.rs`: timeline ("경력") CRUD +
  `POST /api/admin/timeline/reorder` (full `ids` list in desired order).
  Seeded by `migrations/0008_timeline.sql`.
- DB columns added by `migrations/0007_*`: `repo_languages JSONB`,
  `repo_private BOOLEAN`, `attachments JSONB`.