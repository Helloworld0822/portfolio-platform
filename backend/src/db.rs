use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use tokio_postgres::NoTls;

pub type PgPool = Pool<PostgresConnectionManager<NoTls>>;

pub async fn create_pool(database_url: &str) -> anyhow::Result<PgPool> {
    let manager =
        PostgresConnectionManager::new_from_stringlike(database_url, NoTls).unwrap();
    let pool = Pool::builder().max_size(5).build(manager).await?;
    Ok(pool)
}

/// Applies every migration in `./migrations` in filename order.
///
/// Migration files are plain `0001_init.sql`, `0002_...sql`, etc. They are
/// applied inside a transaction and tracked in `_sqlx_migrations` for
/// idempotency, mirroring the behaviour the sqlx migrate! macro had before.
pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    let mut conn = pool.get().await.map_err(anyhow::Error::from)?;

    conn.batch_execute(
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

    for (path, version) in entries {
        let already = conn
            .query_one(
                "SELECT NOT EXISTS(SELECT 1 FROM _sqlx_migrations WHERE version = $1)",
                &[&(version as i64)],
            )
            .await?;
        let missing: bool = already.get(0);
        if !missing {
            continue;
        }

        let sql = std::fs::read_to_string(&path)?;
        let tx = conn.transaction().await?;
        tx.batch_execute(&sql).await?;
        tx.execute(
            "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
             VALUES ($1, $2, true, '\\x00'::bytea, 0)",
            &[&(version as i64), &path.display().to_string()],
        )
        .await?;
        tx.commit().await?;
    }

    Ok(())
}