# portfolio-blog-api

Single-author blog backend for the `portfolio` GitHub Pages site. Rust +
Actix-web + PostgreSQL behind an nginx reverse proxy, GitHub-OAuth-gated
writing, deployed full-stack via `docker compose` on a home Raspberry Pi
and exposed via an ngrok static domain.

See `docs/superpowers/specs/2026-08-27-blog-backend-design.md` for the
full design and `docs/superpowers/plans/2026-08-27-blog-backend.md` for
how it was built.

## Local development

```bash
cp .env.example .env   # edit values as needed for local dev
docker compose up -d postgres
cargo run
```

## Running tests

Tests that touch the database each create a throwaway database
(`test_<uuid>`), run the migrations, and return a pool via
`tests/common::setup()`. They need a reachable Postgres server with
database-creation privileges:

```bash
docker compose up -d postgres
export DATABASE_URL=postgres://blog:blog@localhost:5432/portfolio_blog
cargo test
```

## Running the full stack locally

```bash
cp .env.example .env   # edit values as needed
docker compose up -d --build
curl http://localhost/api/health   # through nginx, not the api container directly
```

`nginx` is the only container with a published host port (`HOST_HTTP_PORT`,
default 80); `api` and `postgres` are reachable only on the internal
compose network (`postgres`'s 5432 stays published too, for local `cargo test` runs against it).

## Deploying to the Raspberry Pi (manual — requires your credentials)

These steps need your GitHub account and physical/SSH access to your Pi,
so they can't be done by an agent. Everything else (all code, the
Containerfile, nginx config, compose.yml) is already built and tested by
this point.

1. **Register a GitHub OAuth App** at
   https://github.com/settings/developers → "New OAuth App".
   - Homepage URL: `https://helloworld0822.github.io/portfolio/`
   - Authorization callback URL: `https://<your-ngrok-static-domain>/api/auth/github/callback`
   - Save the generated Client ID and Client Secret for `.env`.

2. **Reserve a free ngrok static domain**: in the ngrok dashboard, under
   Domains, claim a free static domain (e.g.
   `helloworld0822-blog.ngrok-free.app`). Free accounts get one.

3. **On the Pi**, clone this repo, copy `.env.example` to `.env`, and
   fill in real values: `JWT_SECRET` (a long random string), the GitHub
   OAuth Client ID/Secret from step 1, `BACKEND_BASE_URL` set to your
   ngrok static domain from step 2, `ADMIN_GITHUB_USERNAME` set to your
   own GitHub username.

4. **Start the full stack:**

   ```bash
   docker compose up -d --build
   ```

   This brings up `nginx` (port 80), `api`, and `postgres` together.

5. **Run the ngrok agent** pointed at nginx's published port (80 — the
   single ingress point for the whole stack), using your reserved static
   domain, as a long-lived process (e.g. a systemd unit so it survives
   reboots):

   ```ini
   # /etc/systemd/system/portfolio-blog-ngrok.service
   [Unit]
   Description=ngrok tunnel for portfolio-blog-api
   After=network.target docker.service

   [Service]
   ExecStart=/usr/local/bin/ngrok http --domain=<your-static-domain> 80
   Restart=always
   User=<your-user>

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl enable --now portfolio-blog-ngrok
   ```

6. **Verify**: `curl https://<your-static-domain>/api/health` should
   return `{"status":"ok"}` from a machine that isn't the Pi.

7. **Set `VITE_API_BASE_URL`** to `https://<your-static-domain>` in the
   `portfolio` frontend build (covered by the frontend integration plan,
   not this one) and redeploy the frontend.
