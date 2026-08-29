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
