use std::{collections::HashSet, time::Duration};

use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;

pub type PgPool = Pool<PostgresConnectionManager<MakeTlsConnector>>;

pub async fn create_pool(database_url: &str) -> anyhow::Result<PgPool> {
    let tls = MakeTlsConnector::new(TlsConnector::new()?);
    let manager = PostgresConnectionManager::new_from_stringlike(database_url, tls)?;
    let pool = Pool::builder()
        .max_size(5)
        .min_idle(0)
        .idle_timeout(Duration::from_secs(60))
        .build(manager)
        .await?;
    Ok(pool)
}

/// Applies every migration in `./migrations` in filename order.
///
/// Migration files are plain `0001_init.sql`, `0002_...sql`, etc. They are
/// applied inside a transaction and tracked in `_sqlx_migrations` for
/// idempotency, mirroring the behaviour the sqlx migrate! macro had before.
pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    let mut conn = pool.get().await.map_err(anyhow::Error::from)?;
    let migrations = conn.transaction().await?;

    // Serialize instance startup before creating the migration table or extensions.
    migrations
        .query_one("SELECT pg_advisory_xact_lock(872134098)", &[])
        .await?;

    migrations
        .batch_execute(
            "CREATE TABLE IF NOT EXISTS _sqlx_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            installed_on TIMESTAMPTZ NOT NULL DEFAULT now(),
            success BOOLEAN NOT NULL,
            checksum BYTEA NOT NULL,
            execution_time BIGINT NOT NULL
        )",
        )
        .await?;

    let mut entries: Vec<(std::path::PathBuf, u32)> = std::fs::read_dir("./migrations")?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name();
            let name = name.to_string_lossy();
            let num: u32 = name.split('_').next()?.parse().ok()?;
            Some((e.path(), num))
        })
        .collect();
    entries.sort_by_key(|(_, num)| *num);

    let mut applied: HashSet<i64> = migrations
        .query("SELECT version FROM _sqlx_migrations", &[])
        .await?
        .iter()
        .map(|row| row.get(0))
        .collect();

    for (path, version) in entries {
        let version = i64::from(version);
        if !applied.insert(version) {
            continue;
        }

        let sql = std::fs::read_to_string(&path)?;
        migrations.batch_execute(&sql).await?;
        migrations
            .execute(
                "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
             VALUES ($1, $2, true, '\\x00'::bytea, 0)",
                &[&version, &path.display().to_string()],
            )
            .await?;
    }

    migrations.commit().await?;
    Ok(())
}
