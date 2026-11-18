use std::time::Duration;

use crate::{config::Config, db::PgPool, github_repo};

pub async fn refresh_project_metadata(pool: &PgPool, config: &Config) -> anyhow::Result<()> {
    let urls: Vec<String> = {
        let conn = pool.get().await?;
        conn.query(
            "SELECT DISTINCT url FROM projects WHERE url IS NOT NULL ORDER BY url",
            &[],
        )
        .await?
        .into_iter()
        .map(|row| row.get(0))
        .collect()
    };

    for url in urls {
        if github_repo::repo_path(&url).is_none() && github_repo::account_path(&url).is_none() {
            continue;
        }
        let Some(meta) = github_repo::fetch_project_meta(config, &url).await else {
            tracing::warn!(%url, "project metadata sync failed; keeping stored values");
            continue;
        };
        let languages = serde_json::to_value(meta.languages)?;
        let conn = pool.get().await?;
        conn.execute(
            "UPDATE projects SET repo_languages = $1, repo_private = $2
             WHERE url = $3
               AND (repo_languages IS DISTINCT FROM $1 OR repo_private IS DISTINCT FROM $2)",
            &[&languages, &meta.is_private, &url],
        )
        .await?;
    }

    Ok(())
}

pub async fn run(pool: PgPool, config: Config) {
    loop {
        if let Err(error) = refresh_project_metadata(&pool, &config).await {
            tracing::warn!(%error, "project metadata sync failed");
        }
        tokio::time::sleep(Duration::from_secs(60 * 60)).await;
    }
}
