#![allow(dead_code)]

use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use tokio_postgres::NoTls;

use portfolio_blog_api::auth::jwt::issue_jwt;
use portfolio_blog_api::config::Config;
pub const ADMIN_USERNAME: &str = "Helloworld0822";
pub const JWT_SECRET: &str = "test-secret";

/// A config with no reachable GitHub host. Port 0 is never listening, so any
/// accidental outbound call fails fast instead of hitting the real API.
pub fn test_config() -> Config {
    Config {
        database_url: "postgres://unused/unused".to_string(),
        jwt_secret: JWT_SECRET.to_string(),
        github_client_id: "test-client-id".to_string(),
        github_client_secret: "test-client-secret".to_string(),
        admin_github_username: ADMIN_USERNAME.to_string(),
        frontend_url: "http://localhost:5173/".to_string(),
        backend_base_url: "http://localhost:8080".to_string(),
        cors_allowed_origins: vec!["http://localhost:5173".to_string()],
        host: "127.0.0.1".to_string(),
        port: 8080,
        github_oauth_base_url: "http://localhost:0".to_string(),
        github_api_base_url: "http://localhost:0".to_string(),
    }
}

pub fn admin_token() -> String {
    issue_jwt(ADMIN_USERNAME, "admin", None, JWT_SECRET)
        .expect("issuing a test token should succeed")
}

pub fn auth_header() -> (&'static str, String) {
    ("Authorization", format!("Bearer {}", admin_token()))
}

pub fn user_token(username: &str) -> String {
    issue_jwt(username, "user", None, JWT_SECRET).expect("issuing a test token should succeed")
}

pub fn user_auth_header(username: &str) -> (&'static str, String) {
    ("Authorization", format!("Bearer {}", user_token(username)))
}

pub type PgPool = Pool<PostgresConnectionManager<NoTls>>;

/// Creates a throwaway database, applies migrations, and returns a pool to it.
///
/// Replaces sqlx's `#[sqlx::test]` macro: connects to the server named by
/// `DATABASE_URL`, creates a fresh database named `test_<uuid>`, runs every
/// `migrations/*.sql` file into it, and returns a connection pool. The test
/// database is left in place (like sqlx::test does); tests should not rely on
/// cross-test state.
pub async fn setup() -> (PgPool, String) {
    let base_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL must be set to run integration tests");

    // Parse the connection info so we can connect to the "postgres" admin DB
    // to create a fresh test database.
    let config: tokio_postgres::Config = base_url.parse().expect("invalid DATABASE_URL");
    let db_name = format!("test_{}", uuid::Uuid::new_v4().simple());

    {
        let (admin, conn) = config
            .clone()
            .dbname("postgres")
            .connect(NoTls)
            .await
            .expect("failed to connect to postgres admin database");
        let admin_conn = tokio::spawn(async move {
            let _ = conn.await;
        });

        admin
            .batch_execute(&format!("CREATE DATABASE {}", quote_ident(&db_name)))
            .await
            .expect("failed to create test database");
        drop(admin);
        admin_conn.await.ok();
    }

    let mut mig_cfg = config.clone();
    mig_cfg.dbname(&db_name);
    let (mut client, conn) = mig_cfg.connect(NoTls).await.expect("test db connect");
    let mig_conn = tokio::spawn(conn);
    run_files(&mut client, "migrations")
        .await
        .expect("failed to run migrations");
    drop(client);
    mig_conn.await.ok();

    // Build a pool for the test database.
    let mut pool_cfg = config;
    pool_cfg.dbname(&db_name);
    let manager = PostgresConnectionManager::new(pool_cfg, NoTls);
    let pool = Pool::builder().build(manager).await.expect("pool build");
    (pool, db_name)
}

fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

async fn run_files(client: &mut tokio_postgres::Client, dir: &str) -> anyhow::Result<()> {
    let mut entries: Vec<(String, u32)> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name();
            let name = name.to_string_lossy().to_string();
            let num: u32 = name.split('_').next()?.parse().ok()?;
            Some((name, num))
        })
        .collect();
    entries.sort_by_key(|(_, num)| *num);

    for (name, _) in entries {
        let sql = std::fs::read_to_string(format!("{dir}/{name}"))?;
        client.batch_execute(&sql).await?;
    }
    Ok(())
}
