mod common;

#[tokio::test]
async fn migration_creates_posts_table() {
    let (pool, _db) = common::setup().await;
    let conn = pool.get().await.expect("get connection");
    let row = conn
        .query_one(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts')",
            &[],
        )
        .await
        .unwrap();
    let exists: bool = row.get(0);

    assert!(exists);
}

#[tokio::test]
async fn posts_table_round_trips_expected_columns() {
    let (pool, _db) = common::setup().await;
    {
        let conn = pool.get().await.expect("get connection");
        conn.execute(
            "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
             VALUES ('test-slug', 'Test', 'Excerpt', 'Body', true)",
            &[],
        )
        .await
        .unwrap();
    }

    let conn = pool.get().await.expect("get connection");
    let row = conn
        .query_one(
            "SELECT slug, title, published FROM posts WHERE slug = 'test-slug'",
            &[],
        )
        .await
        .unwrap();

    assert_eq!(row.get::<_, String>(0), "test-slug");
    assert_eq!(row.get::<_, String>(1), "Test");
    assert!(row.get::<_, bool>(2));
}