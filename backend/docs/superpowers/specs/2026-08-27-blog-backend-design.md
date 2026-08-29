# Blog Backend — Design Spec

Date: 2026-08-27
Status: Approved by user, ready for implementation planning

## 1. Purpose

The portfolio site (`~/code/portfolio`, Vite + React, deployed statically to
GitHub Pages) is getting a blog section above its Contact section. GitHub
Pages has no server, so a real backend is needed to let the site owner
write, edit, and publish posts from anywhere (not just by editing files in
the repo).

This spec covers only the backend API service. Frontend integration
(blog section, list/detail pages, admin writer UI) is a separate spec/plan
that will consume the API contract defined here.

## 2. Constraints & Decisions

- Single author: only the portfolio owner (GitHub user `Helloworld0822`)
  may create/edit/delete posts. No multi-user support.
- Backend stack: Rust + Actix-web, matching the `AutoForge` backend's
  conventions (module layout, `thiserror`-based error handling,
  `tracing-actix-web`, Podman-first `Containerfile`/`compose.yml`).
- Database: PostgreSQL, accessed via `sqlx` (compile-time checked queries,
  `sqlx migrate` for schema migrations).
- Hosting: the owner's home Raspberry Pi, via Docker/Podman Compose
  (`api` + `postgres` services).
- Public exposure: an ngrok tunnel using a free static domain (e.g.
  `helloworld0822-blog.ngrok-free.app`), run as a long-lived agent process
  on the Pi, forwarding to the `api` container's published port. A static
  domain avoids the URL-rotation problem of ephemeral ngrok URLs, so the
  frontend can hardcode the API base URL at build time without needing to
  redeploy every time the tunnel restarts.
- Auth: GitHub OAuth. The backend hard-checks that the authenticated
  GitHub username equals an `ADMIN_GITHUB_USERNAME` env var before issuing
  any token — no separate user table, no password storage.
- CORS is locked to the deployed frontend origin
  (`https://helloworld0822.github.io`) plus a local-dev origin.

## 3. Data Model

Single table, `posts`:

| column            | type          | notes                                  |
|--------------------|---------------|-----------------------------------------|
| id                 | uuid (pk)     | `gen_random_uuid()` default             |
| slug               | text, unique  | derived from title, url-safe            |
| title              | text          |                                          |
| excerpt            | text          | short summary shown in list views       |
| content_markdown   | text          | full post body, markdown source         |
| published          | boolean       | default `false` (draft)                 |
| created_at         | timestamptz   | default `now()`                         |
| updated_at         | timestamptz   | set on every update                     |

Slug generation: slugify the title (lowercase, ascii/hyphen, Korean titles
transliterate to a hyphenated ascii fallback plus a short random suffix if
slugify produces an empty/collision-prone string); on unique-constraint
collision, append a short random suffix and retry once.

Migration lives at `migrations/0001_init.sql`, run via `sqlx migrate run`
(also invoked automatically on API startup so a fresh Pi deployment
self-provisions the schema).

## 4. API Surface

All routes are prefixed `/api`.

**Public**
- `GET /posts` — published posts only, ordered `created_at desc`. Returns
  `id, slug, title, excerpt, created_at`. No pagination for v1 (post
  volume is expected to be small; add pagination later if needed).
- `GET /posts/:slug` — full published post. 404 if missing or unpublished
  (drafts are indistinguishable from "not found" to unauthenticated
  callers — no leaking draft existence).
- `GET /health` — liveness/readiness check for the Docker healthcheck.

**Admin (require `Authorization: Bearer <jwt>`)**
- `GET /admin/posts` — all posts including drafts, same ordering.
- `POST /admin/posts` — body `{ title, excerpt, content_markdown,
  published }`; server generates `slug`; returns the created post.
- `PUT /admin/posts/:id` — partial update of the same fields; updates
  `updated_at`. Editing `title` does **not** change `slug` once set
  (stable URLs) — slug is fixed at creation.
- `DELETE /admin/posts/:id` — hard delete.

**Auth**
- `GET /auth/github/login` — redirects to GitHub's OAuth authorize URL
  (`client_id` from env, `scope=read:user`, fixed `redirect_uri` pointing
  at the callback below).
- `GET /auth/github/callback?code=...` — exchanges `code` for a GitHub
  access token, calls `GET https://api.github.com/user`, and:
  - if `login == ADMIN_GITHUB_USERNAME`: issues a JWT (HS256, 7-day
    expiry, secret from `JWT_SECRET`) and redirects to
    `${FRONTEND_URL}#/admin?token=<jwt>`
  - otherwise: redirects to `${FRONTEND_URL}#/admin?error=unauthorized`
    with no token issued

The JWT is handed to the frontend via a URL fragment (not a query param,
so it never reaches server logs) rather than a cross-origin cookie, since
the API origin (ngrok) and frontend origin (github.io) are different
sites and fragment-based handoff avoids `SameSite`/third-party-cookie
issues entirely. The frontend is responsible for reading it out of
`location.hash`, storing it (e.g. `localStorage`), and stripping it from
the URL on load.

## 5. AuthN/AuthZ Middleware

A JWT-validating Actix middleware guards every `/admin/*` route:
validates signature + expiry, rejects with `401` on failure (missing
header, malformed token, bad signature, expired). No per-route
authorization beyond "valid token" is needed since there's only one
possible identity.

## 6. Error Handling

Central `AppError` enum (`thiserror`), mapped to Actix `ResponseError`,
mirroring `AutoForge`'s `error.rs` pattern:

- `NotFound` → 404, `{ "error": "not_found" }`
- `Unauthorized` → 401, `{ "error": "unauthorized" }`
- `Validation(String)` → 400, `{ "error": "validation", "message": ... }`
- `Internal(anyhow::Error)` → 500, `{ "error": "internal" }` (details go
  to `tracing`, never to the response body)

The OAuth callback is the one exception to JSON error responses — auth
failures there redirect back to the frontend with `?error=unauthorized`
rather than returning JSON, since it's a top-level browser navigation.

## 7. Deployment

- `Containerfile` builds a slim release binary (multi-stage, matching
  `AutoForge/backend/Containerfile` conventions).
- `compose.yml`: `api` (this service) + `postgres` (official `postgres`
  image with a named volume), `api` depends on `postgres` being healthy.
- `.env` on the Pi supplies: `DATABASE_URL`, `JWT_SECRET`,
  `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ADMIN_GITHUB_USERNAME`,
  `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`.
- The ngrok agent runs as a separate process on the Pi host (systemd unit
  or its own small container) with a reserved free static domain,
  forwarding to the `api` container's published port. It is not part of
  `compose.yml` since it's host-level tunnel infrastructure, not
  application logic.

## 8. Testing

- Unit tests: slug generation (normal title, collision retry, empty/CJK
  title fallback), JWT issue + validate round-trip, JWT expiry rejection.
- Integration tests (`actix_web::test`, against a throwaway Postgres
  schema/database created per test run): 
  - `GET /posts` never returns unpublished posts
  - `GET /posts/:slug` 404s for both nonexistent and unpublished slugs
  - all `/admin/*` routes 401 without a token and with a malformed/expired
    token
  - create → appears in `/admin/posts` but not `/posts` until `published`
    is set true
  - GitHub callback rejects a non-matching username without issuing a
    token (mocked GitHub API response)
- `cargo test` runs locally against a docker-compose'd Postgres instance.

## 9. Out of Scope (v1)

- Pagination, tags/categories, comments, image uploads, RSS feed, search.
- Any multi-user or role system.
- Rate limiting on the OAuth/login endpoints (acceptable for a
  single-admin hobby service; revisit if abused).

These are natural follow-ups but adding them now would be speculative —
YAGNI until the frontend/writing workflow actually needs them.
