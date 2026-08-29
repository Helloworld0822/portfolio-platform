# Blog Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `portfolio-blog-api` Rust service — a single-author backend for the `portfolio` GitHub Pages site covering both blog posts CRUD and portfolio-projects CRUD, all gated by GitHub OAuth writing.

**Architecture:** Actix-web HTTP API backed by PostgreSQL (via `sqlx`). Public read routes (`GET /api/posts`, `GET /api/posts/:slug`, `GET /api/projects`) are open; write routes (`/api/admin/posts/*`, `/api/admin/projects/*`) require a JWT issued only after GitHub OAuth confirms the caller's GitHub username matches the single hardcoded admin. Deployed full-stack (nginx + api + postgres) via Docker/Podman Compose on the owner's Raspberry Pi, exposed publicly through an ngrok tunnel on a free static domain.

**Tech Stack:** Rust, Actix-web 4, sqlx 0.8 (Postgres, migrate), jsonwebtoken 9, reqwest 0.12, actix-cors 0.7, wiremock 0.6 (tests).

**Spec:** `docs/superpowers/specs/2026-08-27-blog-backend-design.md`

## Global Constraints

- Single author only: the only identity ever allowed to write is the GitHub user matching `ADMIN_GITHUB_USERNAME`. No user table, no multi-user support.
- Stack is fixed: Rust + Actix-web + PostgreSQL (via `sqlx`), matching `~/code/AutoForge/backend`'s module conventions (`config.rs`, `error.rs`, `web`/`routes`, `services`/business logic, `thiserror`-based `AppError`).
- Deployment target is the owner's Raspberry Pi via Docker/Podman Compose; public exposure is an ngrok tunnel on a **free static domain** (not an ephemeral rotating URL).
- CORS allow-list is exactly the deployed frontend origin (`https://helloworld0822.github.io`) plus a local-dev origin — never `*`.
- JWT: HS256, 7-day expiry, secret from `JWT_SECRET` env var. Handed to the frontend via a URL fragment (`#/admin?token=...`), never a cross-origin cookie.
- `slug` is fixed at post creation and never changes on update (stable URLs).
- Draft posts (`published = false`) must be indistinguishable from "not found" to unauthenticated callers.
- Portfolio projects (added mid-plan, at the user's request, to let the same admin dynamically manage the "프로젝트" section instead of it being hardcoded in the frontend) reuse the exact same `AdminUser`/JWT/GitHub-OAuth machinery as posts — no separate auth path. A project has no slug/detail-page concept (the existing frontend shows full project data inline via a modal, not a separate route), so there is only one public list endpoint, no `/projects/:id` detail route.
- Out of scope for v1: pagination, tags/categories on posts specifically, comments, image uploads, RSS, rate limiting, and (for projects) manual reordering — projects list in `created_at DESC` order; there's no `position`/drag-reorder field. Do not add these — YAGNI.
- **Manual step the implementer cannot automate:** registering the GitHub OAuth App (needs the owner's GitHub account) and the actual live rollout onto the physical Raspberry Pi + ngrok reserved domain (needs physical/SSH access the agent doesn't have). Task 10 produces every file and instruction needed for the owner to do this themselves; it cannot be completed end-to-end by an agent.
- **Deferred to the end, not this plan's job:** after all tasks pass final review, create a private GitHub repository for `portfolio-blog-api` and push this branch's history to it (per the user's explicit request). This happens once, after `finishing-a-development-branch`, not as a plan task.

---

## Prerequisites for running tests locally

Every task from Task 2 onward that touches the database needs a reachable Postgres server (tests use `sqlx::test`, which creates and tears down an ephemeral database per test against whatever server `DATABASE_URL` points at).

Before running any `cargo test` in Task 2+:

```bash
cd ~/code/portfolio-blog-api
docker compose up -d postgres
export DATABASE_URL=postgres://blog:blog@localhost:5432/portfolio_blog
```

(`compose.yml` and its `blog`/`blog` credentials are created in Task 10, but you can create a throwaway local Postgres however you like before then — e.g. `docker run -d -e POSTGRES_USER=blog -e POSTGRES_PASSWORD=blog -e POSTGRES_DB=portfolio_blog -p 5432:5432 postgres:16-alpine`. From Task 10 onward, `docker compose up -d postgres` is the real command.)

---

### Task 1: Project scaffold, config, error handling, health endpoint

**Files:**
- Create: `Cargo.toml`
- Create: `src/main.rs`
- Create: `src/lib.rs`
- Create: `src/config.rs`
- Create: `src/error.rs`
- Create: `src/app.rs`
- Create: `src/routes/mod.rs`
- Create: `src/routes/health.rs`
- Test: `tests/health_test.rs`

**Interfaces:**
- Produces: `Config { database_url, jwt_secret, github_client_id, github_client_secret, admin_github_username, frontend_url, backend_base_url, cors_allowed_origins: Vec<String>, host, port: u16, github_oauth_base_url, github_api_base_url }` (all fields `pub`, struct derives `Debug, Clone`), `Config::from_env() -> anyhow::Result<Config>`
- Produces: `AppError` enum (`NotFound`, `Unauthorized`, `Validation(String)`, `Internal(anyhow::Error)`), implements `actix_web::ResponseError`, `impl From<sqlx::Error> for AppError`
- Produces: `app::configure_app(cfg: &mut actix_web::web::ServiceConfig)`, `app::build_cors(origins: &[String]) -> actix_cors::Cors`
- Produces: `portfolio_blog_api::run(config: Config) -> anyhow::Result<()>`

- [ ] **Step 1: Write `Cargo.toml` with every dependency the whole project needs**

```toml
[package]
name = "portfolio-blog-api"
version = "0.1.0"
edition = "2021"

[lib]
name = "portfolio_blog_api"
path = "src/lib.rs"

[[bin]]
name = "portfolio-blog-api"
path = "src/main.rs"

[dependencies]
actix-web = "4"
actix-cors = "0.7"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["runtime-tokio-rustls", "postgres", "uuid", "chrono", "migrate"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
anyhow = "1"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
jsonwebtoken = "9"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
slug = "0.1"
rand = "0.8"
dotenvy = "0.15"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
tracing-actix-web = "0.7"
urlencoding = "2"

[dev-dependencies]
wiremock = "0.6"
```

Declaring every dependency now means later tasks only ever add source files — never touch `Cargo.toml` again.

- [ ] **Step 2: Write `src/config.rs`**

```rust
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub admin_github_username: String,
    pub frontend_url: String,
    pub backend_base_url: String,
    pub cors_allowed_origins: Vec<String>,
    pub host: String,
    pub port: u16,
    pub github_oauth_base_url: String,
    pub github_api_base_url: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            database_url: std::env::var("DATABASE_URL")?,
            jwt_secret: std::env::var("JWT_SECRET")?,
            github_client_id: std::env::var("GITHUB_CLIENT_ID")?,
            github_client_secret: std::env::var("GITHUB_CLIENT_SECRET")?,
            admin_github_username: std::env::var("ADMIN_GITHUB_USERNAME")?,
            frontend_url: std::env::var("FRONTEND_URL")?,
            backend_base_url: std::env::var("BACKEND_BASE_URL")?,
            cors_allowed_origins: std::env::var("CORS_ALLOWED_ORIGINS")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()?,
            github_oauth_base_url: std::env::var("GITHUB_OAUTH_BASE_URL")
                .unwrap_or_else(|_| "https://github.com".to_string()),
            github_api_base_url: std::env::var("GITHUB_API_BASE_URL")
                .unwrap_or_else(|_| "https://api.github.com".to_string()),
        })
    }
}
```

- [ ] **Step 3: Write `src/error.rs`**

```rust
use actix_web::{HttpResponse, ResponseError};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,
    #[error("unauthorized")]
    Unauthorized,
    #[error("validation error: {0}")]
    Validation(String),
    #[error("internal error")]
    Internal(#[from] anyhow::Error),
}

impl ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        match self {
            AppError::NotFound => HttpResponse::NotFound().json(json!({ "error": "not_found" })),
            AppError::Unauthorized => {
                HttpResponse::Unauthorized().json(json!({ "error": "unauthorized" }))
            }
            AppError::Validation(message) => HttpResponse::BadRequest().json(json!({
                "error": "validation",
                "message": message
            })),
            AppError::Internal(err) => {
                tracing::error!(error = %err, "internal error");
                HttpResponse::InternalServerError().json(json!({ "error": "internal" }))
            }
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AppError::NotFound,
            other => AppError::Internal(other.into()),
        }
    }
}
```

- [ ] **Step 4: Write `src/routes/health.rs`**

```rust
use actix_web::HttpResponse;

pub async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
}
```

- [ ] **Step 5: Write `src/routes/mod.rs`**

```rust
pub mod health;
```

- [ ] **Step 6: Write `src/app.rs`**

```rust
use actix_cors::Cors;
use actix_web::{http, web};

use crate::routes;

pub fn configure_app(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/api").route("/health", web::get().to(routes::health::health)));
}

pub fn build_cors(allowed_origins: &[String]) -> Cors {
    let mut cors = Cors::default()
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![http::header::AUTHORIZATION, http::header::CONTENT_TYPE])
        .max_age(3600);

    for origin in allowed_origins {
        cors = cors.allowed_origin(origin);
    }

    cors
}
```

- [ ] **Step 7: Write `src/lib.rs`**

```rust
pub mod app;
pub mod config;
pub mod error;
pub mod routes;

use actix_web::{web, App, HttpServer};

use config::Config;

pub async fn run(config: Config) -> anyhow::Result<()> {
    let bind_addr = format!("{}:{}", config.host, config.port);
    tracing::info!(%bind_addr, "starting portfolio-blog-api");

    let cors_origins = config.cors_allowed_origins.clone();
    let config_data = web::Data::new(config);

    HttpServer::new(move || {
        App::new()
            .wrap(app::build_cors(&cors_origins))
            .wrap(tracing_actix_web::TracingLogger::default())
            .app_data(config_data.clone())
            .configure(app::configure_app)
    })
    .bind(bind_addr)?
    .run()
    .await?;

    Ok(())
}
```

- [ ] **Step 8: Write `src/main.rs`**

```rust
use tracing_subscriber::EnvFilter;

use portfolio_blog_api::config::Config;

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let config = Config::from_env()?;
    portfolio_blog_api::run(config).await
}
```

- [ ] **Step 9: Write the failing test — `tests/health_test.rs`**

```rust
use actix_web::{test, App};

use portfolio_blog_api::app::configure_app;

#[actix_web::test]
async fn health_returns_ok_status() {
    let app = test::init_service(App::new().configure(configure_app)).await;

    let req = test::TestRequest::get().uri("/api/health").to_request();
    let resp = test::call_service(&app, req).await;

    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["status"], "ok");
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `cargo test --test health_test`
Expected: `test health_returns_ok_status ... ok` (this task needs no database, so no Postgres prerequisite yet)

- [ ] **Step 11: Commit**

```bash
git add Cargo.toml src tests/health_test.rs
git commit -m "feat: scaffold actix-web service with config, errors, and health endpoint"
```

---

### Task 2: PostgreSQL pool and schema migration

**Files:**
- Create: `src/db.rs`
- Create: `migrations/0001_init.sql`
- Modify: `src/lib.rs`
- Test: `tests/db_test.rs`

**Interfaces:**
- Consumes: nothing new from Task 1 beyond `Config`
- Produces: `db::create_pool(database_url: &str) -> anyhow::Result<sqlx::PgPool>`, `db::run_migrations(pool: &sqlx::PgPool) -> anyhow::Result<()>`
- Produces (DB schema): `posts(id uuid pk, slug text unique, title text, excerpt text, content_markdown text, published boolean, created_at timestamptz, updated_at timestamptz)`

- [ ] **Step 1: Write `migrations/0001_init.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX posts_published_created_at_idx ON posts (published, created_at DESC);
```

- [ ] **Step 2: Write `src/db.rs`**

```rust
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn create_pool(database_url: &str) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await?;
    Ok(pool)
}

pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}
```

- [ ] **Step 3: Write the failing test — `tests/db_test.rs`**

```rust
use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
async fn migration_creates_posts_table(pool: PgPool) {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    assert!(exists);
}

#[sqlx::test(migrations = "./migrations")]
async fn posts_table_round_trips_expected_columns(pool: PgPool) {
    sqlx::query(
        "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
         VALUES ('test-slug', 'Test', 'Excerpt', 'Body', true)",
    )
    .execute(&pool)
    .await
    .unwrap();

    let row: (String, String, bool) =
        sqlx::query_as("SELECT slug, title, published FROM posts WHERE slug = 'test-slug'")
            .fetch_one(&pool)
            .await
            .unwrap();

    assert_eq!(row.0, "test-slug");
    assert_eq!(row.1, "Test");
    assert!(row.2);
}
```

- [ ] **Step 4: Run the test to confirm the migration itself is correct**

Ensure Postgres is running per "Prerequisites for running tests locally" above, then:
Run: `cargo test --test db_test`
Expected: PASS. This test only needs `migrations/0001_init.sql` (already
written in Step 1) plus a reachable Postgres — `sqlx::test` runs it
directly, so it doesn't depend on `src/db.rs` or `src/lib.rs` at all. It
exists to catch a bad migration file early, before wiring the pool into
`run()` in Step 5. If it fails, fix `migrations/0001_init.sql`, not
`src/db.rs`.

- [ ] **Step 5: Modify `src/lib.rs`** to add the `db` module and wire the pool into `run()`

```rust
pub mod app;
pub mod config;
pub mod db;
pub mod error;
pub mod routes;

use actix_web::{web, App, HttpServer};

use config::Config;

pub async fn run(config: Config) -> anyhow::Result<()> {
    let pool = db::create_pool(&config.database_url).await?;
    db::run_migrations(&pool).await?;

    let bind_addr = format!("{}:{}", config.host, config.port);
    tracing::info!(%bind_addr, "starting portfolio-blog-api");

    let cors_origins = config.cors_allowed_origins.clone();
    let config_data = web::Data::new(config);
    let pool_data = web::Data::new(pool);

    HttpServer::new(move || {
        App::new()
            .wrap(app::build_cors(&cors_origins))
            .wrap(tracing_actix_web::TracingLogger::default())
            .app_data(config_data.clone())
            .app_data(pool_data.clone())
            .configure(app::configure_app)
    })
    .bind(bind_addr)?
    .run()
    .await?;

    Ok(())
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cargo test --test db_test`
Expected: both tests `ok`

- [ ] **Step 7: Commit**

```bash
git add src/db.rs src/lib.rs migrations tests/db_test.rs
git commit -m "feat: add postgres pool and posts table migration"
```

---

### Task 3: Post models and slug generation

**Files:**
- Create: `src/models.rs`
- Create: `src/slug.rs`
- Modify: `src/lib.rs`
- Test: `tests/slug_test.rs`

**Interfaces:**
- Consumes: `sqlx::PgPool` (Task 2)
- Produces: `models::Post { id: Uuid, slug: String, title: String, excerpt: String, content_markdown: String, published: bool, created_at: DateTime<Utc>, updated_at: DateTime<Utc> }` (`Serialize`, `sqlx::FromRow`)
- Produces: `models::PostSummary { id, slug, title, excerpt, created_at }` (`Serialize`, `sqlx::FromRow`)
- Produces: `models::CreatePostRequest { title, excerpt, content_markdown, published }` (`Deserialize`)
- Produces: `models::UpdatePostRequest { title: Option<String>, excerpt: Option<String>, content_markdown: Option<String>, published: Option<bool> }` (`Deserialize`)
- Produces: `slug::slugify(title: &str) -> String`, `slug::unique_slug(pool: &PgPool, title: &str) -> Result<String, sqlx::Error>`

- [ ] **Step 1: Write `src/models.rs`**

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Post {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub excerpt: String,
    pub content_markdown: String,
    pub published: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PostSummary {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub excerpt: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePostRequest {
    pub title: String,
    pub excerpt: String,
    pub content_markdown: String,
    pub published: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePostRequest {
    pub title: Option<String>,
    pub excerpt: Option<String>,
    pub content_markdown: Option<String>,
    pub published: Option<bool>,
}
```

- [ ] **Step 2: Write `src/slug.rs`**

```rust
use rand::Rng;
use sqlx::PgPool;

pub fn slugify(title: &str) -> String {
    let base = slug::slugify(title);
    if base.is_empty() {
        format!("post-{}", random_suffix())
    } else {
        base
    }
}

fn random_suffix() -> String {
    let choices = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| choices[rng.gen_range(0..choices.len())] as char)
        .collect()
}

pub async fn unique_slug(pool: &PgPool, title: &str) -> Result<String, sqlx::Error> {
    let base = slugify(title);

    let base_taken: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM posts WHERE slug = $1)")
            .bind(&base)
            .fetch_one(pool)
            .await?;

    if !base_taken {
        return Ok(base);
    }

    loop {
        let candidate = format!("{}-{}", base, random_suffix());
        let taken: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM posts WHERE slug = $1)")
            .bind(&candidate)
            .fetch_one(pool)
            .await?;
        if !taken {
            return Ok(candidate);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::slugify;

    #[test]
    fn slugifies_ascii_title() {
        assert_eq!(slugify("Hello World"), "hello-world");
    }

    #[test]
    fn falls_back_to_random_slug_for_non_ascii_title() {
        let result = slugify("안녕하세요");
        assert!(result.starts_with("post-"));
        assert_eq!(result.len(), "post-".len() + 6);
    }
}
```

- [ ] **Step 3: Run the pure unit tests to verify they pass**

Run: `cargo test --lib slug::tests`
Expected: both tests `ok` (no database needed for these two)

- [ ] **Step 4: Write the failing DB-backed test — `tests/slug_test.rs`**

```rust
use sqlx::PgPool;

use portfolio_blog_api::slug::unique_slug;

#[sqlx::test(migrations = "./migrations")]
async fn unique_slug_avoids_collision(pool: PgPool) {
    sqlx::query(
        "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
         VALUES ('hello-world', 'Hello World', 'e', 'c', true)",
    )
    .execute(&pool)
    .await
    .unwrap();

    let generated = unique_slug(&pool, "Hello World").await.unwrap();

    assert_ne!(generated, "hello-world");
    assert!(generated.starts_with("hello-world-"));
}

#[sqlx::test(migrations = "./migrations")]
async fn unique_slug_returns_base_when_free(pool: PgPool) {
    let generated = unique_slug(&pool, "Fresh Title").await.unwrap();
    assert_eq!(generated, "fresh-title");
}
```

- [ ] **Step 5: Modify `src/lib.rs`** to add the new modules

```rust
pub mod app;
pub mod config;
pub mod db;
pub mod error;
pub mod models;
pub mod routes;
pub mod slug;

use actix_web::{web, App, HttpServer};

use config::Config;

pub async fn run(config: Config) -> anyhow::Result<()> {
    let pool = db::create_pool(&config.database_url).await?;
    db::run_migrations(&pool).await?;

    let bind_addr = format!("{}:{}", config.host, config.port);
    tracing::info!(%bind_addr, "starting portfolio-blog-api");

    let cors_origins = config.cors_allowed_origins.clone();
    let config_data = web::Data::new(config);
    let pool_data = web::Data::new(pool);

    HttpServer::new(move || {
        App::new()
            .wrap(app::build_cors(&cors_origins))
            .wrap(tracing_actix_web::TracingLogger::default())
            .app_data(config_data.clone())
            .app_data(pool_data.clone())
            .configure(app::configure_app)
    })
    .bind(bind_addr)?
    .run()
    .await?;

    Ok(())
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cargo test --test slug_test`
Expected: both tests `ok`

- [ ] **Step 7: Commit**

```bash
git add src/models.rs src/slug.rs src/lib.rs tests/slug_test.rs
git commit -m "feat: add post models and slug generation"
```

---

### Task 4: Public post routes

**Files:**
- Create: `src/routes/posts.rs`
- Modify: `src/app.rs`
- Test: `tests/posts_public_test.rs`

**Interfaces:**
- Consumes: `models::Post`, `models::PostSummary`, `error::AppError`
- Produces: `routes::posts::list_posts(pool: web::Data<PgPool>) -> Result<HttpResponse, AppError>`, `routes::posts::get_post(pool: web::Data<PgPool>, path: web::Path<String>) -> Result<HttpResponse, AppError>`

- [ ] **Step 1: Write the failing test — `tests/posts_public_test.rs`**

```rust
use actix_web::{test, web, App};
use sqlx::PgPool;

use portfolio_blog_api::app::configure_app;

async fn seed_post(pool: &PgPool, slug: &str, title: &str, published: bool) {
    sqlx::query(
        "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
         VALUES ($1, $2, 'excerpt', 'body', $3)",
    )
    .bind(slug)
    .bind(title)
    .bind(published)
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test(migrations = "./migrations")]
async fn list_posts_only_returns_published(pool: PgPool) {
    seed_post(&pool, "published-post", "Published", true).await;
    seed_post(&pool, "draft-post", "Draft", false).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get().uri("/api/posts").to_request();
    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    let slugs: Vec<&str> = body
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["slug"].as_str().unwrap())
        .collect();

    assert_eq!(slugs, vec!["published-post"]);
}

#[sqlx::test(migrations = "./migrations")]
async fn get_post_returns_published_post_by_slug(pool: PgPool) {
    seed_post(&pool, "published-post", "Published", true).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/posts/published-post")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["title"], "Published");
}

#[sqlx::test(migrations = "./migrations")]
async fn get_post_404s_for_unpublished_or_missing_slug(pool: PgPool) {
    seed_post(&pool, "draft-post", "Draft", false).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/posts/draft-post")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 404);

    let req = test::TestRequest::get()
        .uri("/api/posts/does-not-exist")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 404);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --test posts_public_test`
Expected: FAIL — the test compiles fine (it only calls `configure_app`
over HTTP, it doesn't import anything from `routes::posts`), but every
assertion fails because `/api/posts` isn't registered yet: actix returns
404 for the unmatched route instead of the 200/200/404 the test expects.

- [ ] **Step 3: Write `src/routes/posts.rs`**

```rust
use actix_web::{web, HttpResponse};
use sqlx::PgPool;

use crate::error::AppError;
use crate::models::{Post, PostSummary};

pub async fn list_posts(pool: web::Data<PgPool>) -> Result<HttpResponse, AppError> {
    let posts: Vec<PostSummary> = sqlx::query_as(
        "SELECT id, slug, title, excerpt, created_at FROM posts
         WHERE published = true
         ORDER BY created_at DESC",
    )
    .fetch_all(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(posts))
}

pub async fn get_post(
    pool: web::Data<PgPool>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let slug = path.into_inner();

    let post: Post = sqlx::query_as("SELECT * FROM posts WHERE slug = $1 AND published = true")
        .bind(&slug)
        .fetch_optional(pool.get_ref())
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(HttpResponse::Ok().json(post))
}
```

- [ ] **Step 4: Modify `src/routes/mod.rs`**

```rust
pub mod health;
pub mod posts;
```

- [ ] **Step 5: Modify `src/app.rs`** to register the two public routes

```rust
use actix_cors::Cors;
use actix_web::{http, web};

use crate::routes;

pub fn configure_app(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/health", web::get().to(routes::health::health))
            .route("/posts", web::get().to(routes::posts::list_posts))
            .route("/posts/{slug}", web::get().to(routes::posts::get_post)),
    );
}

pub fn build_cors(allowed_origins: &[String]) -> Cors {
    let mut cors = Cors::default()
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![http::header::AUTHORIZATION, http::header::CONTENT_TYPE])
        .max_age(3600);

    for origin in allowed_origins {
        cors = cors.allowed_origin(origin);
    }

    cors
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cargo test --test posts_public_test`
Expected: all three tests `ok`

- [ ] **Step 7: Commit**

```bash
git add src/routes/posts.rs src/routes/mod.rs src/app.rs tests/posts_public_test.rs
git commit -m "feat: add public post list and detail routes"
```

---

### Task 5: JWT issuance and validation

**Files:**
- Create: `src/auth/mod.rs`
- Create: `src/auth/jwt.rs`
- Modify: `src/lib.rs`

**Interfaces:**
- Produces: `auth::jwt::Claims { sub: String, exp: usize }` (`Serialize, Deserialize`)
- Produces: `auth::jwt::issue_jwt(username: &str, secret: &str) -> anyhow::Result<String>`
- Produces: `auth::jwt::issue_jwt_with_ttl(username: &str, secret: &str, ttl: chrono::Duration) -> anyhow::Result<String>`
- Produces: `auth::jwt::validate_jwt(token: &str, secret: &str) -> anyhow::Result<Claims>`

- [ ] **Step 1: Write `src/auth/jwt.rs`** (tests included inline — no database involved)

```rust
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

const TOKEN_TTL_DAYS: i64 = 7;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

pub fn issue_jwt(username: &str, secret: &str) -> anyhow::Result<String> {
    issue_jwt_with_ttl(username, secret, Duration::days(TOKEN_TTL_DAYS))
}

pub fn issue_jwt_with_ttl(username: &str, secret: &str, ttl: Duration) -> anyhow::Result<String> {
    let exp = (Utc::now() + ttl).timestamp() as usize;
    let claims = Claims {
        sub: username.to_string(),
        exp,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(token)
}

pub fn validate_jwt(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issued_token_validates_and_round_trips_username() {
        let token = issue_jwt("Helloworld0822", "test-secret").unwrap();
        let claims = validate_jwt(&token, "test-secret").unwrap();
        assert_eq!(claims.sub, "Helloworld0822");
    }

    #[test]
    fn expired_token_is_rejected() {
        let token = issue_jwt_with_ttl("Helloworld0822", "test-secret", Duration::seconds(-10)).unwrap();
        assert!(validate_jwt(&token, "test-secret").is_err());
    }

    #[test]
    fn wrong_secret_is_rejected() {
        let token = issue_jwt("Helloworld0822", "test-secret").unwrap();
        assert!(validate_jwt(&token, "different-secret").is_err());
    }
}
```

- [ ] **Step 2: Write `src/auth/mod.rs`**

```rust
pub mod jwt;
```

- [ ] **Step 3: Modify `src/lib.rs`** to add the `auth` module

```rust
pub mod app;
pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod models;
pub mod routes;
pub mod slug;

use actix_web::{web, App, HttpServer};

use config::Config;

pub async fn run(config: Config) -> anyhow::Result<()> {
    let pool = db::create_pool(&config.database_url).await?;
    db::run_migrations(&pool).await?;

    let bind_addr = format!("{}:{}", config.host, config.port);
    tracing::info!(%bind_addr, "starting portfolio-blog-api");

    let cors_origins = config.cors_allowed_origins.clone();
    let config_data = web::Data::new(config);
    let pool_data = web::Data::new(pool);

    HttpServer::new(move || {
        App::new()
            .wrap(app::build_cors(&cors_origins))
            .wrap(tracing_actix_web::TracingLogger::default())
            .app_data(config_data.clone())
            .app_data(pool_data.clone())
            .configure(app::configure_app)
    })
    .bind(bind_addr)?
    .run()
    .await?;

    Ok(())
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --lib auth::jwt::tests`
Expected: all three tests `ok`

- [ ] **Step 5: Commit**

```bash
git add src/auth src/lib.rs
git commit -m "feat: add JWT issuance and validation"
```

---

### Task 6: Admin auth middleware (`AdminUser` extractor)

**Files:**
- Create: `src/auth/middleware.rs`
- Modify: `src/auth/mod.rs`
- Create: `tests/common/mod.rs`
- Test: `tests/middleware_test.rs`

**Interfaces:**
- Consumes: `auth::jwt::validate_jwt`, `config::Config`
- Produces: `auth::middleware::AdminUser { username: String }`, implementing `actix_web::FromRequest` with `Error = error::AppError`
- Produces (test helper): `tests::common::test_config() -> Config`

- [ ] **Step 1: Write `tests/common/mod.rs`**

```rust
use portfolio_blog_api::config::Config;

pub fn test_config() -> Config {
    Config {
        database_url: String::new(),
        jwt_secret: "test-secret".to_string(),
        github_client_id: "test-client-id".to_string(),
        github_client_secret: "test-client-secret".to_string(),
        admin_github_username: "Helloworld0822".to_string(),
        frontend_url: "http://localhost:5173/".to_string(),
        backend_base_url: "http://localhost:8080".to_string(),
        cors_allowed_origins: vec!["http://localhost:5173".to_string()],
        host: "127.0.0.1".to_string(),
        port: 8080,
        github_oauth_base_url: "http://localhost:0".to_string(),
        github_api_base_url: "http://localhost:0".to_string(),
    }
}
```

- [ ] **Step 2: Write the failing test — `tests/middleware_test.rs`**

```rust
mod common;

use actix_web::{test, web, App, HttpResponse, Responder};

use portfolio_blog_api::auth::jwt::issue_jwt;
use portfolio_blog_api::auth::middleware::AdminUser;

async fn protected(user: AdminUser) -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({ "username": user.username }))
}

#[actix_web::test]
async fn rejects_request_without_authorization_header() {
    let config = common::test_config();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .route("/protected", web::get().to(protected)),
    )
    .await;
    let req = test::TestRequest::get().uri("/protected").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 401);
}

#[actix_web::test]
async fn rejects_malformed_token() {
    let config = common::test_config();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .route("/protected", web::get().to(protected)),
    )
    .await;
    let req = test::TestRequest::get()
        .uri("/protected")
        .insert_header(("Authorization", "Bearer not-a-real-token"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 401);
}

#[actix_web::test]
async fn accepts_valid_token_and_exposes_username() {
    let config = common::test_config();
    let token = issue_jwt(&config.admin_github_username, &config.jwt_secret).unwrap();

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .route("/protected", web::get().to(protected)),
    )
    .await;
    let req = test::TestRequest::get()
        .uri("/protected")
        .insert_header(("Authorization", format!("Bearer {}", token)))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["username"], "Helloworld0822");
}
```

(Each test builds its own `App` inline rather than sharing a typed helper
function — a helper returning `App<impl ServiceFactory<...>>` requires
pinning down actix-web's exact associated `Response` body type, which is
easy to get subtly wrong. Inlining sidesteps that entirely.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `cargo test --test middleware_test`
Expected: FAIL to compile — `portfolio_blog_api::auth::middleware` does not exist yet

- [ ] **Step 4: Write `src/auth/middleware.rs`**

```rust
use actix_web::{dev::Payload, web, FromRequest, HttpRequest};
use futures_util::future::{ready, Ready};

use crate::auth::jwt::validate_jwt;
use crate::config::Config;
use crate::error::AppError;

pub struct AdminUser {
    pub username: String,
}

impl FromRequest for AdminUser {
    type Error = AppError;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let result = (|| {
            let config = req
                .app_data::<web::Data<Config>>()
                .ok_or(AppError::Unauthorized)?;

            let header = req
                .headers()
                .get("Authorization")
                .and_then(|h| h.to_str().ok())
                .ok_or(AppError::Unauthorized)?;

            let token = header.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?;

            let claims =
                validate_jwt(token, &config.jwt_secret).map_err(|_| AppError::Unauthorized)?;

            Ok(AdminUser {
                username: claims.sub,
            })
        })();

        ready(result)
    }
}
```

`futures_util` is already available transitively via `actix-web`'s dependency tree, but add it explicitly since this file names it directly:

- [ ] **Step 5: Modify `Cargo.toml`** to add `futures-util` under `[dependencies]`

```toml
futures-util = "0.3"
```

- [ ] **Step 6: Modify `src/auth/mod.rs`**

```rust
pub mod jwt;
pub mod middleware;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cargo test --test middleware_test`
Expected: all three tests `ok`

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml src/auth/middleware.rs src/auth/mod.rs tests/common tests/middleware_test.rs
git commit -m "feat: add JWT-based admin auth extractor"
```

---

### Task 7: Admin post routes (create, update, delete, list-all)

**Files:**
- Modify: `src/routes/posts.rs`
- Modify: `src/app.rs`
- Test: `tests/posts_admin_test.rs`

**Interfaces:**
- Consumes: `auth::middleware::AdminUser`, `slug::unique_slug`, `tests::common::test_config`
- Produces: `routes::posts::list_admin_posts`, `routes::posts::create_post`, `routes::posts::update_post`, `routes::posts::delete_post` (all `async fn(...) -> Result<HttpResponse, AppError>`)

- [ ] **Step 1: Write the failing test — `tests/posts_admin_test.rs`**

```rust
mod common;

use actix_web::{test, web, App};
use sqlx::PgPool;

use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::auth::jwt::issue_jwt;

fn auth_header() -> (&'static str, String) {
    let config = common::test_config();
    let token = issue_jwt(&config.admin_github_username, &config.jwt_secret).unwrap();
    ("Authorization", format!("Bearer {}", token))
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_routes_require_authorization(pool: PgPool) {
    let config = common::test_config();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get().uri("/api/admin/posts").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 401);

    let req = test::TestRequest::post()
        .uri("/api/admin/posts")
        .set_json(serde_json::json!({
            "title": "New",
            "excerpt": "e",
            "content_markdown": "c",
            "published": false
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 401);
}

#[sqlx::test(migrations = "./migrations")]
async fn create_then_list_admin_and_public(pool: PgPool) {
    let config = common::test_config();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;
    let (header_name, header_value) = auth_header();

    let req = test::TestRequest::post()
        .uri("/api/admin/posts")
        .insert_header((header_name, header_value.clone()))
        .set_json(serde_json::json!({
            "title": "My First Post",
            "excerpt": "short",
            "content_markdown": "full body",
            "published": false
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let created: serde_json::Value = test::read_body_json(resp).await;
    let id = created["id"].as_str().unwrap().to_string();
    assert_eq!(created["slug"], "my-first-post");
    assert_eq!(created["published"], false);

    // Draft is visible in the admin list...
    let req = test::TestRequest::get()
        .uri("/api/admin/posts")
        .insert_header((header_name, header_value.clone()))
        .to_request();
    let resp = test::call_service(&app, req).await;
    let admin_list: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(admin_list.as_array().unwrap().len(), 1);

    // ...but not in the public list.
    let req = test::TestRequest::get().uri("/api/posts").to_request();
    let resp = test::call_service(&app, req).await;
    let public_list: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(public_list.as_array().unwrap().len(), 0);

    // Publishing via update makes it public.
    let req = test::TestRequest::put()
        .uri(&format!("/api/admin/posts/{}", id))
        .insert_header((header_name, header_value.clone()))
        .set_json(serde_json::json!({ "published": true }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());
    let updated: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(updated["published"], true);
    assert_eq!(updated["slug"], "my-first-post", "slug must not change on update");

    let req = test::TestRequest::get().uri("/api/posts").to_request();
    let resp = test::call_service(&app, req).await;
    let public_list: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(public_list.as_array().unwrap().len(), 1);

    // Deleting removes it entirely.
    let req = test::TestRequest::delete()
        .uri(&format!("/api/admin/posts/{}", id))
        .insert_header((header_name, header_value))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 204);

    let req = test::TestRequest::get().uri("/api/posts").to_request();
    let resp = test::call_service(&app, req).await;
    let public_list: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(public_list.as_array().unwrap().len(), 0);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --test posts_admin_test`
Expected: FAIL — compiles fine (the test only drives HTTP requests
through `configure_app`), but `/api/admin/posts` isn't registered yet so
every request gets a 404 instead of the 401/201/200/204 the test expects.

- [ ] **Step 3: Modify `src/routes/posts.rs`** — add the admin handlers to the existing file (full file shown)

```rust
use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::{CreatePostRequest, Post, PostSummary, UpdatePostRequest};
use crate::slug::unique_slug;

pub async fn list_posts(pool: web::Data<PgPool>) -> Result<HttpResponse, AppError> {
    let posts: Vec<PostSummary> = sqlx::query_as(
        "SELECT id, slug, title, excerpt, created_at FROM posts
         WHERE published = true
         ORDER BY created_at DESC",
    )
    .fetch_all(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(posts))
}

pub async fn get_post(
    pool: web::Data<PgPool>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let slug = path.into_inner();

    let post: Post = sqlx::query_as("SELECT * FROM posts WHERE slug = $1 AND published = true")
        .bind(&slug)
        .fetch_optional(pool.get_ref())
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(HttpResponse::Ok().json(post))
}

pub async fn list_admin_posts(
    pool: web::Data<PgPool>,
    _user: AdminUser,
) -> Result<HttpResponse, AppError> {
    let posts: Vec<PostSummary> = sqlx::query_as(
        "SELECT id, slug, title, excerpt, created_at FROM posts ORDER BY created_at DESC",
    )
    .fetch_all(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(posts))
}

pub async fn create_post(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    body: web::Json<CreatePostRequest>,
) -> Result<HttpResponse, AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::Validation("title must not be empty".into()));
    }

    let slug = unique_slug(pool.get_ref(), &body.title).await?;

    let post: Post = sqlx::query_as(
        "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *",
    )
    .bind(&slug)
    .bind(&body.title)
    .bind(&body.excerpt)
    .bind(&body.content_markdown)
    .bind(body.published)
    .fetch_one(pool.get_ref())
    .await?;

    Ok(HttpResponse::Created().json(post))
}

pub async fn update_post(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
    body: web::Json<UpdatePostRequest>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();

    let existing: Post = sqlx::query_as("SELECT * FROM posts WHERE id = $1")
        .bind(id)
        .fetch_optional(pool.get_ref())
        .await?
        .ok_or(AppError::NotFound)?;

    let title = body.title.clone().unwrap_or(existing.title);
    let excerpt = body.excerpt.clone().unwrap_or(existing.excerpt);
    let content_markdown = body
        .content_markdown
        .clone()
        .unwrap_or(existing.content_markdown);
    let published = body.published.unwrap_or(existing.published);

    let post: Post = sqlx::query_as(
        "UPDATE posts
         SET title = $1, excerpt = $2, content_markdown = $3, published = $4, updated_at = now()
         WHERE id = $5
         RETURNING *",
    )
    .bind(&title)
    .bind(&excerpt)
    .bind(&content_markdown)
    .bind(published)
    .bind(id)
    .fetch_one(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(post))
}

pub async fn delete_post(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();

    let result = sqlx::query("DELETE FROM posts WHERE id = $1")
        .bind(id)
        .execute(pool.get_ref())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}
```

- [ ] **Step 4: Modify `src/app.rs`** to register the admin routes

```rust
use actix_cors::Cors;
use actix_web::{http, web};

use crate::routes;

pub fn configure_app(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/health", web::get().to(routes::health::health))
            .route("/posts", web::get().to(routes::posts::list_posts))
            .route("/posts/{slug}", web::get().to(routes::posts::get_post))
            .route("/admin/posts", web::get().to(routes::posts::list_admin_posts))
            .route("/admin/posts", web::post().to(routes::posts::create_post))
            .route("/admin/posts/{id}", web::put().to(routes::posts::update_post))
            .route("/admin/posts/{id}", web::delete().to(routes::posts::delete_post)),
    );
}

pub fn build_cors(allowed_origins: &[String]) -> Cors {
    let mut cors = Cors::default()
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![http::header::AUTHORIZATION, http::header::CONTENT_TYPE])
        .max_age(3600);

    for origin in allowed_origins {
        cors = cors.allowed_origin(origin);
    }

    cors
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cargo test --test posts_admin_test`
Expected: both tests `ok`

- [ ] **Step 6: Commit**

```bash
git add src/routes/posts.rs src/app.rs tests/posts_admin_test.rs
git commit -m "feat: add admin post CRUD routes"
```

---

### Task 8: GitHub OAuth login and callback

**Files:**
- Create: `src/auth/github.rs`
- Create: `src/routes/auth_routes.rs`
- Modify: `src/auth/mod.rs`
- Modify: `src/routes/mod.rs`
- Modify: `src/app.rs`
- Test: `tests/auth_github_test.rs`

**Interfaces:**
- Consumes: `config::Config`, `auth::jwt::issue_jwt`
- Produces: `auth::github::authorize_url(config: &Config) -> String`, `auth::github::exchange_code(config: &Config, code: &str) -> anyhow::Result<String>`, `auth::github::fetch_user(config: &Config, access_token: &str) -> anyhow::Result<GithubUser { login: String }>`
- Produces: `routes::auth_routes::github_login(config: web::Data<Config>) -> HttpResponse`, `routes::auth_routes::github_callback(config: web::Data<Config>, query: web::Query<CallbackQuery>) -> HttpResponse`

- [ ] **Step 1: Write the failing test — `tests/auth_github_test.rs`**

```rust
mod common;

use actix_web::{test, web, App};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use portfolio_blog_api::app::configure_app;

#[actix_web::test]
async fn callback_issues_token_for_matching_username() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/login/oauth/access_token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "access_token": "gh-token-123",
            "token_type": "bearer"
        })))
        .mount(&mock_server)
        .await;

    Mock::given(method("GET"))
        .and(path("/user"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "login": "Helloworld0822" })),
        )
        .mount(&mock_server)
        .await;

    let mut config = common::test_config();
    config.github_oauth_base_url = mock_server.uri();
    config.github_api_base_url = mock_server.uri();

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config.clone()))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/auth/github/callback?code=abc123")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 302);
    let location = resp.headers().get("Location").unwrap().to_str().unwrap();
    assert!(location.starts_with(&format!("{}#/admin?token=", config.frontend_url)));
}

#[actix_web::test]
async fn callback_rejects_non_matching_username() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/login/oauth/access_token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "access_token": "gh-token-123",
            "token_type": "bearer"
        })))
        .mount(&mock_server)
        .await;

    Mock::given(method("GET"))
        .and(path("/user"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "login": "someone-else" })),
        )
        .mount(&mock_server)
        .await;

    let mut config = common::test_config();
    config.github_oauth_base_url = mock_server.uri();
    config.github_api_base_url = mock_server.uri();

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config.clone()))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/auth/github/callback?code=abc123")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 302);
    let location = resp.headers().get("Location").unwrap().to_str().unwrap();
    assert_eq!(
        location,
        format!("{}#/admin?error=unauthorized", config.frontend_url)
    );
}

#[actix_web::test]
async fn callback_rejects_missing_code() {
    let config = common::test_config();

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config.clone()))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/auth/github/callback")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 302);
    let location = resp.headers().get("Location").unwrap().to_str().unwrap();
    assert_eq!(
        location,
        format!("{}#/admin?error=unauthorized", config.frontend_url)
    );
}

#[actix_web::test]
async fn login_redirects_to_github_authorize_url() {
    let config = common::test_config();

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config.clone()))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/auth/github/login")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 302);
    let location = resp.headers().get("Location").unwrap().to_str().unwrap();
    assert!(location.starts_with(&config.github_oauth_base_url));
    assert!(location.contains("client_id=test-client-id"));
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --test auth_github_test`
Expected: FAIL — compiles fine (the test only drives HTTP requests
through `configure_app`), but `/api/auth/github/login` and
`/api/auth/github/callback` aren't registered yet so every request gets a
404 instead of the 302 the test expects.

- [ ] **Step 3: Write `src/auth/github.rs`**

```rust
use reqwest::Client;
use serde::Deserialize;

use crate::config::Config;

#[derive(Debug, Deserialize)]
struct GithubTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GithubUser {
    pub login: String,
}

fn redirect_uri(config: &Config) -> String {
    format!("{}/api/auth/github/callback", config.backend_base_url)
}

pub fn authorize_url(config: &Config) -> String {
    format!(
        "{}/login/oauth/authorize?client_id={}&redirect_uri={}&scope=read:user",
        config.github_oauth_base_url,
        config.github_client_id,
        urlencoding::encode(&redirect_uri(config)),
    )
}

pub async fn exchange_code(config: &Config, code: &str) -> anyhow::Result<String> {
    let client = Client::new();
    let redirect_uri = redirect_uri(config);

    let res: GithubTokenResponse = client
        .post(format!(
            "{}/login/oauth/access_token",
            config.github_oauth_base_url
        ))
        .header("Accept", "application/json")
        .form(&[
            ("client_id", config.github_client_id.as_str()),
            ("client_secret", config.github_client_secret.as_str()),
            ("code", code),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await?
        .json()
        .await?;

    if let Some(err) = res.error {
        anyhow::bail!("github token exchange failed: {}", err);
    }

    res.access_token
        .ok_or_else(|| anyhow::anyhow!("no access_token in github response"))
}

pub async fn fetch_user(config: &Config, access_token: &str) -> anyhow::Result<GithubUser> {
    let client = Client::new();
    let user: GithubUser = client
        .get(format!("{}/user", config.github_api_base_url))
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "portfolio-blog-api")
        .send()
        .await?
        .json()
        .await?;

    Ok(user)
}
```

- [ ] **Step 4: Write `src/routes/auth_routes.rs`**

```rust
use actix_web::{web, HttpResponse};
use serde::Deserialize;

use crate::auth::github;
use crate::auth::jwt::issue_jwt;
use crate::config::Config;

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
}

pub async fn github_login(config: web::Data<Config>) -> HttpResponse {
    HttpResponse::Found()
        .append_header(("Location", github::authorize_url(&config)))
        .finish()
}

pub async fn github_callback(
    config: web::Data<Config>,
    query: web::Query<CallbackQuery>,
) -> HttpResponse {
    let unauthorized_redirect = || {
        HttpResponse::Found()
            .append_header((
                "Location",
                format!("{}#/admin?error=unauthorized", config.frontend_url),
            ))
            .finish()
    };

    let Some(code) = &query.code else {
        return unauthorized_redirect();
    };

    let access_token = match github::exchange_code(&config, code).await {
        Ok(token) => token,
        Err(err) => {
            tracing::warn!(error = %err, "github code exchange failed");
            return unauthorized_redirect();
        }
    };

    let user = match github::fetch_user(&config, &access_token).await {
        Ok(user) => user,
        Err(err) => {
            tracing::warn!(error = %err, "github user fetch failed");
            return unauthorized_redirect();
        }
    };

    if user.login != config.admin_github_username {
        return unauthorized_redirect();
    }

    match issue_jwt(&user.login, &config.jwt_secret) {
        Ok(token) => HttpResponse::Found()
            .append_header((
                "Location",
                format!("{}#/admin?token={}", config.frontend_url, token),
            ))
            .finish(),
        Err(err) => {
            tracing::error!(error = %err, "jwt issuance failed");
            unauthorized_redirect()
        }
    }
}
```

- [ ] **Step 5: Modify `src/auth/mod.rs`**

```rust
pub mod github;
pub mod jwt;
pub mod middleware;
```

- [ ] **Step 6: Modify `src/routes/mod.rs`**

```rust
pub mod auth_routes;
pub mod health;
pub mod posts;
```

- [ ] **Step 7: Modify `src/app.rs`** to register the auth routes (final version of this file)

```rust
use actix_cors::Cors;
use actix_web::{http, web};

use crate::routes;

pub fn configure_app(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/health", web::get().to(routes::health::health))
            .route("/posts", web::get().to(routes::posts::list_posts))
            .route("/posts/{slug}", web::get().to(routes::posts::get_post))
            .route("/admin/posts", web::get().to(routes::posts::list_admin_posts))
            .route("/admin/posts", web::post().to(routes::posts::create_post))
            .route("/admin/posts/{id}", web::put().to(routes::posts::update_post))
            .route("/admin/posts/{id}", web::delete().to(routes::posts::delete_post))
            .route(
                "/auth/github/login",
                web::get().to(routes::auth_routes::github_login),
            )
            .route(
                "/auth/github/callback",
                web::get().to(routes::auth_routes::github_callback),
            ),
    );
}

pub fn build_cors(allowed_origins: &[String]) -> Cors {
    let mut cors = Cors::default()
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![http::header::AUTHORIZATION, http::header::CONTENT_TYPE])
        .max_age(3600);

    for origin in allowed_origins {
        cors = cors.allowed_origin(origin);
    }

    cors
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cargo test --test auth_github_test`
Expected: all four tests `ok`

- [ ] **Step 9: Run the full test suite to confirm nothing regressed**

Run: `cargo test`
Expected: every test across every file `ok`

- [ ] **Step 10: Commit**

```bash
git add src/auth/github.rs src/routes/auth_routes.rs src/auth/mod.rs src/routes/mod.rs src/app.rs tests/auth_github_test.rs
git commit -m "feat: add GitHub OAuth login and callback"
```

---

### Task 9: Portfolio projects CRUD (dynamic "프로젝트" section)

Added mid-plan at the user's request: let the same single admin manage the
portfolio's "프로젝트" (projects) section dynamically, instead of it being a
hardcoded array in the frontend (`~/code/portfolio/src/components/Projects.tsx`
today has a `Project` type: `{ title, description, details: string[], tags:
string[], status, period?, role?, url? }`, shown via a card grid + modal).
This task gives the backend the same shape via CRUD, reusing every piece of
auth infrastructure already built (Tasks 5-8) — no new auth path.

**Files:**
- Create: `migrations/0002_projects.sql`
- Modify: `src/models.rs`
- Create: `src/routes/projects.rs`
- Modify: `src/routes/mod.rs`
- Modify: `src/app.rs`
- Test: `tests/projects_test.rs`

**Interfaces:**
- Consumes: `error::AppError`, `auth::middleware::AdminUser`, `tests::common::test_config` (all already built)
- Produces: `models::Project { id: Uuid, title: String, description: String, details: Vec<String>, tags: Vec<String>, status: String, period: Option<String>, role: Option<String>, url: Option<String>, published: bool, created_at: DateTime<Utc>, updated_at: DateTime<Utc> }` (`Serialize`, `sqlx::FromRow`)
- Produces: `models::CreateProjectRequest`, `models::UpdateProjectRequest` (`Deserialize`, mirroring `Create/UpdatePostRequest`'s shape)
- Produces: `routes::projects::{list_projects, list_admin_projects, create_project, update_project, delete_project}`

- [ ] **Step 1: Write `migrations/0002_projects.sql`**

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    details TEXT[] NOT NULL DEFAULT '{}',
    tags TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL,
    period TEXT,
    role TEXT,
    url TEXT,
    published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX projects_published_created_at_idx ON projects (published, created_at DESC);
```

- [ ] **Step 2: Write the failing test — `tests/projects_test.rs`**

```rust
mod common;

use actix_web::{test, web, App};
use sqlx::PgPool;

use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::auth::jwt::issue_jwt;

fn auth_header() -> (&'static str, String) {
    let config = common::test_config();
    let token = issue_jwt(&config.admin_github_username, &config.jwt_secret).unwrap();
    ("Authorization", format!("Bearer {}", token))
}

#[sqlx::test(migrations = "./migrations")]
async fn list_projects_only_returns_published(pool: PgPool) {
    sqlx::query(
        "INSERT INTO projects (title, description, details, tags, status, published)
         VALUES ('Published', 'desc', '{}', '{}', '완료', true)",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO projects (title, description, details, tags, status, published)
         VALUES ('Draft', 'desc', '{}', '{}', '완료', false)",
    )
    .execute(&pool)
    .await
    .unwrap();

    let config = common::test_config();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get().uri("/api/projects").to_request();
    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    let titles: Vec<&str> = body
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["title"].as_str().unwrap())
        .collect();
    assert_eq!(titles, vec!["Published"]);
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_projects_require_authorization(pool: PgPool) {
    let config = common::test_config();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get().uri("/api/admin/projects").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 401);
}

#[sqlx::test(migrations = "./migrations")]
async fn create_update_delete_project_flow(pool: PgPool) {
    let config = common::test_config();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;
    let (header_name, header_value) = auth_header();

    let req = test::TestRequest::post()
        .uri("/api/admin/projects")
        .insert_header((header_name, header_value.clone()))
        .set_json(serde_json::json!({
            "title": "AutoForge",
            "description": "AI pipeline",
            "details": ["Built X", "Built Y"],
            "tags": ["Rust", "React"],
            "status": "진행 중",
            "period": "2026",
            "role": "개인 프로젝트",
            "url": "https://github.com/example/autoforge",
            "published": false
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let created: serde_json::Value = test::read_body_json(resp).await;
    let id = created["id"].as_str().unwrap().to_string();
    assert_eq!(created["tags"], serde_json::json!(["Rust", "React"]));

    let req = test::TestRequest::get().uri("/api/projects").to_request();
    let resp = test::call_service(&app, req).await;
    let public_list: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(public_list.as_array().unwrap().len(), 0, "draft must not be public");

    let req = test::TestRequest::put()
        .uri(&format!("/api/admin/projects/{}", id))
        .insert_header((header_name, header_value.clone()))
        .set_json(serde_json::json!({ "published": true }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let req = test::TestRequest::get().uri("/api/projects").to_request();
    let resp = test::call_service(&app, req).await;
    let public_list: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(public_list.as_array().unwrap().len(), 1);

    let req = test::TestRequest::delete()
        .uri(&format!("/api/admin/projects/{}", id))
        .insert_header((header_name, header_value))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 204);
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cargo test --test projects_test`
Expected: FAIL — compiles fine (only calls `configure_app` over HTTP), but
every request 404s since `/api/projects` and `/api/admin/projects` aren't
registered yet.

- [ ] **Step 4: Modify `src/models.rs`** — append the `Project` structs to the existing file (full file shown)

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Post {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub excerpt: String,
    pub content_markdown: String,
    pub published: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PostSummary {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub excerpt: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePostRequest {
    pub title: String,
    pub excerpt: String,
    pub content_markdown: String,
    pub published: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePostRequest {
    pub title: Option<String>,
    pub excerpt: Option<String>,
    pub content_markdown: Option<String>,
    pub published: Option<bool>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Project {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub details: Vec<String>,
    pub tags: Vec<String>,
    pub status: String,
    pub period: Option<String>,
    pub role: Option<String>,
    pub url: Option<String>,
    pub published: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    pub title: String,
    pub description: String,
    pub details: Vec<String>,
    pub tags: Vec<String>,
    pub status: String,
    pub period: Option<String>,
    pub role: Option<String>,
    pub url: Option<String>,
    pub published: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub details: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub status: Option<String>,
    pub period: Option<String>,
    pub role: Option<String>,
    pub url: Option<String>,
    pub published: Option<bool>,
}
```

`UpdateProjectRequest`'s `period`/`role`/`url` follow the same limitation
as elsewhere in this plan: `None` means "don't change," so there is no way
to clear an already-set optional field back to null via update in v1 —
consistent with how `UpdatePostRequest` behaves, not a new gap.

- [ ] **Step 5: Write `src/routes/projects.rs`**

```rust
use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::{CreateProjectRequest, Project, UpdateProjectRequest};

pub async fn list_projects(pool: web::Data<PgPool>) -> Result<HttpResponse, AppError> {
    let projects: Vec<Project> =
        sqlx::query_as("SELECT * FROM projects WHERE published = true ORDER BY created_at DESC")
            .fetch_all(pool.get_ref())
            .await?;

    Ok(HttpResponse::Ok().json(projects))
}

pub async fn list_admin_projects(
    pool: web::Data<PgPool>,
    _user: AdminUser,
) -> Result<HttpResponse, AppError> {
    let projects: Vec<Project> = sqlx::query_as("SELECT * FROM projects ORDER BY created_at DESC")
        .fetch_all(pool.get_ref())
        .await?;

    Ok(HttpResponse::Ok().json(projects))
}

pub async fn create_project(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    body: web::Json<CreateProjectRequest>,
) -> Result<HttpResponse, AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::Validation("title must not be empty".into()));
    }

    let project: Project = sqlx::query_as(
        "INSERT INTO projects (title, description, details, tags, status, period, role, url, published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *",
    )
    .bind(&body.title)
    .bind(&body.description)
    .bind(&body.details)
    .bind(&body.tags)
    .bind(&body.status)
    .bind(&body.period)
    .bind(&body.role)
    .bind(&body.url)
    .bind(body.published)
    .fetch_one(pool.get_ref())
    .await?;

    Ok(HttpResponse::Created().json(project))
}

pub async fn update_project(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
    body: web::Json<UpdateProjectRequest>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();

    let existing: Project = sqlx::query_as("SELECT * FROM projects WHERE id = $1")
        .bind(id)
        .fetch_optional(pool.get_ref())
        .await?
        .ok_or(AppError::NotFound)?;

    let title = body.title.clone().unwrap_or(existing.title);
    let description = body.description.clone().unwrap_or(existing.description);
    let details = body.details.clone().unwrap_or(existing.details);
    let tags = body.tags.clone().unwrap_or(existing.tags);
    let status = body.status.clone().unwrap_or(existing.status);
    let period = body.period.clone().or(existing.period);
    let role = body.role.clone().or(existing.role);
    let url = body.url.clone().or(existing.url);
    let published = body.published.unwrap_or(existing.published);

    let project: Project = sqlx::query_as(
        "UPDATE projects
         SET title = $1, description = $2, details = $3, tags = $4, status = $5,
             period = $6, role = $7, url = $8, published = $9, updated_at = now()
         WHERE id = $10
         RETURNING *",
    )
    .bind(&title)
    .bind(&description)
    .bind(&details)
    .bind(&tags)
    .bind(&status)
    .bind(&period)
    .bind(&role)
    .bind(&url)
    .bind(published)
    .bind(id)
    .fetch_one(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(project))
}

pub async fn delete_project(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();

    let result = sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(id)
        .execute(pool.get_ref())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}
```

- [ ] **Step 6: Modify `src/routes/mod.rs`**

```rust
pub mod auth_routes;
pub mod health;
pub mod posts;
pub mod projects;
```

- [ ] **Step 7: Modify `src/app.rs`** — register the projects routes (full file shown, final version of this file)

```rust
use actix_cors::Cors;
use actix_web::{http, web};

use crate::routes;

pub fn configure_app(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/health", web::get().to(routes::health::health))
            .route("/posts", web::get().to(routes::posts::list_posts))
            .route("/posts/{slug}", web::get().to(routes::posts::get_post))
            .route("/admin/posts", web::get().to(routes::posts::list_admin_posts))
            .route("/admin/posts", web::post().to(routes::posts::create_post))
            .route("/admin/posts/{id}", web::put().to(routes::posts::update_post))
            .route("/admin/posts/{id}", web::delete().to(routes::posts::delete_post))
            .route(
                "/auth/github/login",
                web::get().to(routes::auth_routes::github_login),
            )
            .route(
                "/auth/github/callback",
                web::get().to(routes::auth_routes::github_callback),
            )
            .route("/projects", web::get().to(routes::projects::list_projects))
            .route(
                "/admin/projects",
                web::get().to(routes::projects::list_admin_projects),
            )
            .route(
                "/admin/projects",
                web::post().to(routes::projects::create_project),
            )
            .route(
                "/admin/projects/{id}",
                web::put().to(routes::projects::update_project),
            )
            .route(
                "/admin/projects/{id}",
                web::delete().to(routes::projects::delete_project),
            ),
    );
}

pub fn build_cors(allowed_origins: &[String]) -> Cors {
    let mut cors = Cors::default()
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![http::header::AUTHORIZATION, http::header::CONTENT_TYPE])
        .max_age(3600);

    for origin in allowed_origins {
        cors = cors.allowed_origin(origin);
    }

    cors
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cargo test --test projects_test`
Expected: all three tests `ok`

- [ ] **Step 9: Run the full test suite to confirm nothing regressed**

Run: `cargo test`
Expected: every test across every file `ok`

- [ ] **Step 10: Commit**

```bash
git add migrations/0002_projects.sql src/models.rs src/routes/projects.rs src/routes/mod.rs src/app.rs tests/projects_test.rs
git commit -m "feat: add portfolio projects CRUD"
```

---

### Task 10: Deployment artifacts (Containerfile, nginx, Compose, env template, README)

**Files:**
- Create: `Containerfile`
- Create: `nginx/Containerfile`
- Create: `nginx/nginx.conf`
- Create: `compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (pure ops/config files)
- Produces: a buildable, full-stack `docker compose` setup (nginx reverse proxy → api → postgres) and a documented deployment procedure

This task has no Rust code and no `cargo test` step. Its "tests" are: the release binary builds, `docker compose config` validates the compose file, and the README's manual checklist is complete and accurate for the parts an agent cannot do itself (see Global Constraints).

nginx sits in front of the `api` service (matching `~/code/AutoForge`'s `nginx` + `api` compose pattern): it is the only container with a published host port, and it reverse-proxies everything to `api` on the internal compose network. This is what the ngrok tunnel in this task's README points at — `ngrok http --domain=<static-domain> 80` (nginx's port), not 8080 directly. Reasoning: it gives a single stable ingress point if this stack grows more services later, and matches this owner's existing convention rather than introducing a bespoke one.

- [ ] **Step 1: Write `.gitignore`**

```
/target
.env
```

- [ ] **Step 2: Write `Containerfile`** (the Rust API image — unchanged from before)

```dockerfile
FROM docker.io/library/rust:1.82-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release

FROM docker.io/library/debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/portfolio-blog-api ./portfolio-blog-api
COPY migrations ./migrations
EXPOSE 8080
CMD ["./portfolio-blog-api"]
```

- [ ] **Step 3: Write `nginx/nginx.conf`**

```nginx
events {}

http {
    server {
        listen 80;

        location /api/ {
            proxy_pass http://api:8080/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

- [ ] **Step 4: Write `nginx/Containerfile`**

```dockerfile
FROM docker.io/library/nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
```

- [ ] **Step 5: Write `compose.yml`** (nginx is the only service with a published port; `api` is reachable only inside the compose network via `expose`)

```yaml
name: portfolio-blog-api

services:
  nginx:
    build:
      context: ./nginx
      dockerfile: Containerfile
    image: portfolio-blog-nginx:latest
    ports:
      - "${HOST_HTTP_PORT:-80}:80"
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://localhost:80/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  api:
    build:
      context: .
      dockerfile: Containerfile
    image: portfolio-blog-api:latest
    env_file:
      - .env
    environment:
      HOST: 0.0.0.0
      PORT: "8080"
    expose:
      - "8080"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://localhost:8080/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  postgres:
    image: docker.io/library/postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-blog}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-blog}
      POSTGRES_DB: ${POSTGRES_DB:-portfolio_blog}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "${POSTGRES_USER:-blog}"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  postgres-data:
```

`postgres`'s host port mapping (`5432:5432`) stays for local dev/testing convenience (see "Prerequisites for running tests locally"); it is not part of the public ingress path — only `nginx`'s port is meant to be reachable from outside the Pi.

- [ ] **Step 6: Write `.env.example`**

```
DATABASE_URL=postgres://blog:blog@postgres:5432/portfolio_blog
JWT_SECRET=change-me-to-a-long-random-string
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
ADMIN_GITHUB_USERNAME=Helloworld0822
FRONTEND_URL=https://helloworld0822.github.io/portfolio/
BACKEND_BASE_URL=https://your-static-subdomain.ngrok-free.app
CORS_ALLOWED_ORIGINS=https://helloworld0822.github.io,http://localhost:5173
POSTGRES_USER=blog
POSTGRES_PASSWORD=blog
POSTGRES_DB=portfolio_blog
HOST_HTTP_PORT=80
```

- [ ] **Step 7: Write `README.md`**

```markdown
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

Tests that touch the database use `sqlx::test`, which needs a reachable
Postgres server to create ephemeral test databases against:

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
compose network (`postgres`'s 5432 stays published too, for local
`sqlx::test` runs against it).

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
```

- [ ] **Step 8: Verify the release binary builds cleanly**

Run: `cargo build --release`
Expected: builds with no errors

- [ ] **Step 9: Verify the compose file is syntactically valid**

Run: `docker compose config --quiet` (or `podman compose config --quiet` if using Podman, matching this owner's other projects)
Expected: exits with no output and status 0

- [ ] **Step 10: Commit**

```bash
git add Containerfile nginx compose.yml .env.example .gitignore README.md
git commit -m "chore: add nginx reverse proxy and full-stack compose deployment"
```

---

## After this plan

This plan delivers a fully tested backend API covering both blog posts
and portfolio projects. The actual rollout to the Raspberry Pi (README's
manual section) is on the owner.

Once the final whole-branch review is clean and the branch is finished
(per `finishing-a-development-branch`), create a private GitHub
repository for `portfolio-blog-api` and push this history to it — deferred
to this point per the user's request, rather than done as its own task.

Once `BACKEND_BASE_URL` is live and reachable, the next plan — frontend
integration in `~/code/portfolio` (blog section + projects section switched
from a hardcoded array to fetching `GET /api/projects`, routing, list/detail
pages, admin writer/editor UI, API client) — can be brainstormed and
written against this API's real contract (Tasks 1–9 above).
