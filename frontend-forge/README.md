# Forge browser frontend

The portfolio application is written in `src/*.fg`. Forge emits JavaScript,
which is bundled with the independent forge-browser primitive bridge. There is
no React application in this directory. Native browser bindings provide DOM,
events, localStorage, HTTP, lossless JSON and sanitized Markdown.

Implemented screens: portfolio projects and attachments, timeline, contact,
blog list/post/comments, GitHub session handling and admin posts/projects/
timeline/contact/bans. Admin supports CRUD, Markdown preview, uploads, GitHub
repository import, timeline ordering and inbox deduplication. The editor exposes
API fields as JSON; it is a functional migration, not visual parity with the
original React editors. Login and API authorization are verified by the server;
the browser only uses decoded claims to show relevant controls.

Build after recursive Git checkout:

```sh
npm ci --prefix backend-forge/vendor/forge-browser
npm ci --prefix frontend-forge
npm run build --prefix frontend-forge
```

Requires the pinned compiler at backend-forge/build/toolchain/bin/forge, or set
FORGE_BIN to another compiler with the JavaScript backend. FORGE_BROWSER_SOURCE
can point to a local browser module checkout. Output: dist/.

Opt in to both migrated server and frontend with:

```sh
docker compose -f docker-compose.yml -f docker-compose.forge.yml -f docker-compose.frontend-forge.yml build
```

Review configuration and use an isolated project/port for testing before a
production rollout. The default compose file continues to use the original
Rust/React deployment. The browser application supports /, /blog, /blog/:id and
/admin/:resource on one origin. Existing separate portfolio/blog host redirects
are not duplicated by this new nginx config.

Browser tests run against a disposable Forge API, never the production DB:

```sh
FORGE_FRONTEND_URL=http://localhost:18113 npm test --prefix frontend-forge
```
