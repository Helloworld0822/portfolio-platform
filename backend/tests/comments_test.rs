mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::Comment;
use serde_json::json;
use uuid::Uuid;

async fn seed_post(pool: &common::PgPool, slug: &str, published: bool) -> Uuid {
    let conn = pool.get().await.expect("get connection");
    let row = conn
        .query_one(
            "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
             VALUES ($1, $2, 'an excerpt', '# body', $3)
             RETURNING id",
            &[&slug, &slug, &published],
        )
        .await
        .expect("seeding a post should succeed");

    row.get::<_, Uuid>("id")
}

async fn seed_comment(pool: &common::PgPool, post_id: Uuid, author: &str, body: &str) {
    let conn = pool.get().await.expect("get connection");
    conn.execute(
        "INSERT INTO comments (post_id, author_login, body) VALUES ($1, $2, $3)",
        &[&post_id, &author, &body],
    )
    .await
    .expect("seeding a comment should succeed");
}

async fn seed_comment_return_id(pool: &common::PgPool, post_id: Uuid) -> Uuid {
    let conn = pool.get().await.expect("get connection");
    let row = conn
        .query_one(
            "INSERT INTO comments (post_id, author_login, body) VALUES ($1, 'spammer', 'buy now')
             RETURNING id",
            &[&post_id],
        )
        .await
        .expect("seeding a comment should succeed");
    row.get::<_, Uuid>("id")
}

async fn build_app(pool: common::PgPool) -> impl actix_web::dev::Service<
    actix_http::Request,
    Response = actix_web::dev::ServiceResponse,
    Error = actix_web::Error,
> {
    test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await
}

#[tokio::test]
async fn list_comments_returns_an_empty_list_for_a_post_with_no_comments() {
    let (pool, _db) = common::setup().await;
    seed_post(&pool, "quiet-post", true).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::get()
        .uri("/api/posts/quiet-post/comments")
        .to_request();
    let body: Vec<Comment> = test::call_and_read_body_json(&app, req).await;

    assert!(body.is_empty());
}

#[tokio::test]
async fn list_comments_returns_comments_oldest_first() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "chatty-post", true).await;
    seed_comment(&pool, post_id, "alice", "first!").await;
    seed_comment(&pool, post_id, "bob", "second").await;

    let app = build_app(pool).await;
    let req = test::TestRequest::get()
        .uri("/api/posts/chatty-post/comments")
        .to_request();
    let body: Vec<Comment> = test::call_and_read_body_json(&app, req).await;

    assert_eq!(body.len(), 2);
    assert_eq!(body[0].author_login, "alice");
    assert_eq!(body[1].author_login, "bob");
}

#[tokio::test]
async fn list_comments_404s_for_an_unknown_slug() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let req = test::TestRequest::get()
        .uri("/api/posts/does-not-exist/comments")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn create_comment_requires_authentication() {
    let (pool, _db) = common::setup().await;
    seed_post(&pool, "needs-auth", true).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::post()
        .uri("/api/posts/needs-auth/comments")
        .set_json(json!({ "body": "hello" }))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn create_comment_saves_the_authenticated_users_login_and_returns_201() {
    let (pool, _db) = common::setup().await;
    seed_post(&pool, "great-post", true).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::post()
        .uri("/api/posts/great-post/comments")
        .insert_header(common::user_auth_header("carol"))
        .set_json(json!({ "body": "nice write-up!" }))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 201);

    let comment: Comment = test::read_body_json(resp).await;
    assert_eq!(comment.author_login, "carol");
    assert_eq!(comment.body, "nice write-up!");
}

#[tokio::test]
async fn create_comment_rejects_an_empty_body() {
    let (pool, _db) = common::setup().await;
    seed_post(&pool, "empty-body-post", true).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::post()
        .uri("/api/posts/empty-body-post/comments")
        .insert_header(common::user_auth_header("carol"))
        .set_json(json!({ "body": "   " }))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn create_comment_404s_for_an_unpublished_post() {
    let (pool, _db) = common::setup().await;
    seed_post(&pool, "still-a-draft", false).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::post()
        .uri("/api/posts/still-a-draft/comments")
        .insert_header(common::user_auth_header("carol"))
        .set_json(json!({ "body": "hello" }))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn delete_comment_requires_admin() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "moderated-post", true).await;
    let comment_id = seed_comment_return_id(&pool, post_id).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::delete()
        .uri(&format!("/api/admin/comments/{comment_id}"))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 401);

    let req = test::TestRequest::delete()
        .uri(&format!("/api/admin/comments/{comment_id}"))
        .insert_header(common::user_auth_header("someone-else"))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 401);
}

#[tokio::test]
async fn delete_comment_returns_204_then_404() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "cleanup-post", true).await;
    let comment_id = seed_comment_return_id(&pool, post_id).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::delete()
        .uri(&format!("/api/admin/comments/{comment_id}"))
        .insert_header(common::auth_header())
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 204);

    let req = test::TestRequest::delete()
        .uri(&format!("/api/admin/comments/{comment_id}"))
        .insert_header(common::auth_header())
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 404);
}