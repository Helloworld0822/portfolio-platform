mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::PostSummary;

async fn seed_post(pool: &common::PgPool, title: &str, published: bool) -> i64 {
    let conn = pool.get().await.expect("get connection");
    let excerpt = "an excerpt";
    let body = "# body";
    let row = conn
        .query_one(
            "INSERT INTO posts (title, excerpt, content_markdown, published)
             VALUES ($1, $2, $3, $4)
             RETURNING id",
            &[&title, &excerpt, &body, &published],
        )
        .await
        .expect("seeding a post should succeed");
    row.get::<_, i64>("id")
}

#[tokio::test]
async fn list_posts_returns_only_published() {
    let (pool, _db) = common::setup().await;
    let id = seed_post(&pool, "Published One", true).await;
    seed_post(&pool, "Draft One", false).await;

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
    assert_eq!(body[0].id, id);
}

#[tokio::test]
async fn get_post_returns_the_published_post() {
    let (pool, _db) = common::setup().await;
    let id = seed_post(&pool, "Hello World", true).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri(&format!("/api/posts/{id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 200);
}

#[tokio::test]
async fn get_post_hides_drafts_behind_404() {
    let (pool, _db) = common::setup().await;
    let id = seed_post(&pool, "Secret Draft", false).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri(&format!("/api/posts/{id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn health_reports_ok() {
    let (pool, _db) = common::setup().await;

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

#[tokio::test]
async fn openapi_spec_is_served() {
    let (pool, _db) = common::setup().await;

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
