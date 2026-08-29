mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::PostSummary;
use sqlx::PgPool;

async fn seed_post(pool: &PgPool, slug: &str, title: &str, published: bool) {
    sqlx::query(
        "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(slug)
    .bind(title)
    .bind("an excerpt")
    .bind("# body")
    .bind(published)
    .execute(pool)
    .await
    .expect("seeding a post should succeed");
}

#[sqlx::test(migrations = "./migrations")]
async fn list_posts_returns_only_published(pool: PgPool) {
    seed_post(&pool, "published-one", "Published One", true).await;
    seed_post(&pool, "draft-one", "Draft One", false).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get().uri("/api/posts").to_request();
    let body: Vec<PostSummary> = test::call_and_read_body_json(&app, req).await;

    assert_eq!(body.len(), 1);
    assert_eq!(body[0].slug, "published-one");
}

#[sqlx::test(migrations = "./migrations")]
async fn get_post_returns_the_published_post(pool: PgPool) {
    seed_post(&pool, "hello-world", "Hello World", true).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/posts/hello-world")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 200);
}

#[sqlx::test(migrations = "./migrations")]
async fn get_post_hides_drafts_behind_404(pool: PgPool) {
    seed_post(&pool, "secret-draft", "Secret Draft", false).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/posts/secret-draft")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 404);
}

#[sqlx::test(migrations = "./migrations")]
async fn health_reports_ok(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get().uri("/api/health").to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 200);
}

#[sqlx::test(migrations = "./migrations")]
async fn openapi_spec_is_served(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/openapi.json")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 200);
}
