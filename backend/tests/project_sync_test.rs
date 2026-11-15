mod common;

use portfolio_blog_api::project_sync::refresh_project_metadata;
use serde_json::json;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn refreshes_shared_repository_for_published_and_hidden_projects() {
    let (pool, _db) = common::setup().await;
    let server = MockServer::start().await;
    let mut config = common::test_config();
    config.github_api_base_url = server.uri();
    let conn = pool.get().await.unwrap();
    conn.batch_execute("DELETE FROM projects").await.unwrap();
    conn.execute(
        "INSERT INTO projects (title, description, status, url, published, repo_languages)
         VALUES ('Live', '', '완료', 'https://github.com/owner/repo', true, '{\"Rust\": 100}'),
                ('Hidden', '', '완료', 'https://github.com/owner/repo', false, '{\"Rust\": 100}'),
                ('External', '', '완료', 'https://example.com', true, '{}')",
        &[],
    )
    .await
    .unwrap();
    let before = conn
        .query_one("SELECT updated_at FROM projects WHERE title = 'Live'", &[])
        .await
        .unwrap()
        .get::<_, chrono::DateTime<chrono::Utc>>(0);
    drop(conn);

    Mock::given(method("GET"))
        .and(path("/repos/owner/repo/languages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"Rust": 25, "TypeScript": 75})),
        )
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/repos/owner/repo"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"private": true})))
        .expect(1)
        .mount(&server)
        .await;

    refresh_project_metadata(&pool, &config).await.unwrap();

    let conn = pool.get().await.unwrap();
    let rows = conn
        .query("SELECT * FROM projects WHERE title != 'External'", &[])
        .await
        .unwrap();
    assert_eq!(rows.len(), 2);
    for row in rows {
        assert_eq!(
            row.get::<_, serde_json::Value>("repo_languages"),
            json!({"Rust": 25, "TypeScript": 75})
        );
        assert!(row.get::<_, bool>("repo_private"));
        assert_eq!(
            row.get::<_, chrono::DateTime<chrono::Utc>>("updated_at"),
            before
        );
    }
    assert_eq!(server.received_requests().await.unwrap().len(), 2);
}

#[tokio::test]
async fn github_failure_preserves_metadata_and_next_refresh_recovers() {
    let (pool, _db) = common::setup().await;
    let server = MockServer::start().await;
    let mut config = common::test_config();
    config.github_api_base_url = server.uri();
    let conn = pool.get().await.unwrap();
    conn.batch_execute("DELETE FROM projects").await.unwrap();
    conn.execute(
        "INSERT INTO projects (title, description, status, url, repo_languages, repo_private)
         VALUES ('Repo', '', '완료', 'https://github.com/owner/repo', '{\"Rust\": 100}', true)",
        &[],
    )
    .await
    .unwrap();
    drop(conn);

    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(403))
        .mount(&server)
        .await;
    refresh_project_metadata(&pool, &config).await.unwrap();
    let conn = pool.get().await.unwrap();
    let row = conn.query_one("SELECT * FROM projects", &[]).await.unwrap();
    assert_eq!(
        row.get::<_, serde_json::Value>("repo_languages"),
        json!({"Rust": 100})
    );
    assert!(row.get::<_, bool>("repo_private"));
    drop(conn);

    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/repos/owner/repo/languages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({})))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/repos/owner/repo"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"private": false})))
        .mount(&server)
        .await;
    refresh_project_metadata(&pool, &config).await.unwrap();
    let conn = pool.get().await.unwrap();
    let row = conn.query_one("SELECT * FROM projects", &[]).await.unwrap();
    assert_eq!(row.get::<_, serde_json::Value>("repo_languages"), json!({}));
    assert!(!row.get::<_, bool>("repo_private"));
}

#[tokio::test]
async fn refreshes_account_language_totals_excluding_private_repositories() {
    let (pool, _db) = common::setup().await;
    let server = MockServer::start().await;
    let mut config = common::test_config();
    config.github_api_base_url = server.uri();
    let conn = pool.get().await.unwrap();
    conn.batch_execute("DELETE FROM projects").await.unwrap();
    conn.execute(
        "INSERT INTO projects (title, description, status, url)
         VALUES ('Org', '', '완료', 'https://github.com/team')",
        &[],
    )
    .await
    .unwrap();
    drop(conn);

    let repos: Vec<_> = [("one", false), ("two", false), ("secret", true)]
        .into_iter()
        .map(|(name, private)| {
            json!({
                "name": name, "full_name": format!("team/{name}"),
                "html_url": format!("https://github.com/team/{name}"),
                "description": null, "language": null, "private": private,
                "owner": {"login": "team"}
            })
        })
        .collect();
    Mock::given(method("GET"))
        .and(path("/orgs/team/repos"))
        .respond_with(ResponseTemplate::new(200).set_body_json(repos))
        .mount(&server)
        .await;
    for name in ["one", "two"] {
        Mock::given(method("GET"))
            .and(path(format!("/repos/team/{name}/languages")))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"Rust": 50})))
            .mount(&server)
            .await;
    }

    refresh_project_metadata(&pool, &config).await.unwrap();

    let conn = pool.get().await.unwrap();
    let row = conn.query_one("SELECT * FROM projects", &[]).await.unwrap();
    assert_eq!(
        row.get::<_, serde_json::Value>("repo_languages"),
        json!({"Rust": 100})
    );
    assert!(!row.get::<_, bool>("repo_private"));
    assert_eq!(server.received_requests().await.unwrap().len(), 3);
}
