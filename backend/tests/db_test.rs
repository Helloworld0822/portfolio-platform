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
