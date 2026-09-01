mod common;

use portfolio_blog_api::slug::unique_slug;

#[tokio::test]
async fn unique_slug_avoids_collision() {
    let (pool, _db) = common::setup().await;
    {
        let conn = pool.get().await.expect("get connection");
        conn.execute(
            "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
             VALUES ('hello-world', 'Hello World', 'e', 'c', true)",
            &[],
        )
        .await
        .unwrap();
    }

    let generated = unique_slug(&pool, "Hello World").await.unwrap();

    assert_ne!(generated, "hello-world");
    assert!(generated.starts_with("hello-world-"));
}

#[tokio::test]
async fn unique_slug_returns_base_when_free() {
    let (pool, _db) = common::setup().await;
    let generated = unique_slug(&pool, "Fresh Title").await.unwrap();
    assert_eq!(generated, "fresh-title");
}
