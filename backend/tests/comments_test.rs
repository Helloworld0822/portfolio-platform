mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::Comment;
use serde_json::json;
use uuid::Uuid;

async fn seed_post(pool: &common::PgPool, title: &str, published: bool) -> i64 {
    let conn = pool.get().await.expect("get connection");
    let row = conn
        .query_one(
            "INSERT INTO posts (title, excerpt, content_markdown, published)
             VALUES ($1, 'an excerpt', '# body', $2)
             RETURNING id",
            &[&title, &published],
        )
        .await
        .expect("seeding a post should succeed");

    row.get::<_, i64>("id")
}

async fn seed_comment(pool: &common::PgPool, post_id: i64, author: &str, body: &str) {
    let conn = pool.get().await.expect("get connection");
    conn.execute(
        "INSERT INTO comments (post_id, author_login, body) VALUES ($1, $2, $3)",
        &[&post_id, &author, &body],
    )
    .await
    .expect("seeding a comment should succeed");
}

async fn seed_comment_return_id(pool: &common::PgPool, post_id: i64) -> Uuid {
    seed_comment_by(pool, post_id, "spammer").await
}

async fn seed_comment_by(pool: &common::PgPool, post_id: i64, author: &str) -> Uuid {
    let conn = pool.get().await.expect("get connection");
    let row = conn
        .query_one(
            "INSERT INTO comments (post_id, author_login, body) VALUES ($1, $2, 'buy now')
             RETURNING id",
            &[&post_id, &author],
        )
        .await
        .expect("seeding a comment should succeed");
    row.get::<_, Uuid>("id")
}

async fn build_app(
    pool: common::PgPool,
) -> impl actix_web::dev::Service<
    actix_http::Request,
    Response = actix_web::dev::ServiceResponse,
    Error = actix_web::Error,
> {
    let bans = common::ban_store(&pool).await;
    test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .app_data(web::Data::new(bans))
            .configure(configure_app),
    )
    .await
}

#[tokio::test]
async fn list_comments_returns_an_empty_list_for_a_post_with_no_comments() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "Quiet Post", true).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::get()
        .uri(&format!("/api/posts/{post_id}/comments"))
        .to_request();
    let body: Vec<Comment> = test::call_and_read_body_json(&app, req).await;

    assert!(body.is_empty());
}

#[tokio::test]
async fn list_comments_returns_comments_oldest_first() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "Chatty Post", true).await;
    seed_comment(&pool, post_id, "alice", "first!").await;
    seed_comment(&pool, post_id, "bob", "second").await;

    let app = build_app(pool).await;
    let req = test::TestRequest::get()
        .uri(&format!("/api/posts/{post_id}/comments"))
        .to_request();
    let body: Vec<Comment> = test::call_and_read_body_json(&app, req).await;

    assert_eq!(body.len(), 2);
    assert_eq!(body[0].author_login, "alice");
    assert_eq!(body[1].author_login, "bob");
}

#[tokio::test]
async fn list_comments_404s_for_an_unknown_id() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let req = test::TestRequest::get()
        .uri("/api/posts/999999/comments")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn create_comment_requires_authentication() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "Needs Auth", true).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::post()
        .uri(&format!("/api/posts/{post_id}/comments"))
        .set_json(json!({ "body": "hello" }))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn create_comment_saves_the_authenticated_users_login_and_returns_201() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "Great Post", true).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::post()
        .uri(&format!("/api/posts/{post_id}/comments"))
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
    let post_id = seed_post(&pool, "Empty Body Post", true).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::post()
        .uri(&format!("/api/posts/{post_id}/comments"))
        .insert_header(common::user_auth_header("carol"))
        .set_json(json!({ "body": "   " }))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn create_comment_404s_for_an_unpublished_post() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "Still A Draft", false).await;

    let app = build_app(pool).await;
    let req = test::TestRequest::post()
        .uri(&format!("/api/posts/{post_id}/comments"))
        .insert_header(common::user_auth_header("carol"))
        .set_json(json!({ "body": "hello" }))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn delete_comment_requires_admin() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "Moderated Post", true).await;
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
    let post_id = seed_post(&pool, "Cleanup Post", true).await;
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

#[tokio::test]
async fn delete_own_comment_requires_authentication() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "Auth Needed", true).await;
    let comment_id = seed_comment_by(&pool, post_id, "carol").await;

    let app = build_app(pool).await;
    let req = test::TestRequest::delete()
        .uri(&format!("/api/comments/{comment_id}"))
        .to_request();

    assert_eq!(test::call_service(&app, req).await.status(), 401);
}

#[tokio::test]
async fn delete_own_comment_forbids_a_different_user_and_keeps_the_comment() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "Someone Else's Post", true).await;
    let comment_id = seed_comment_by(&pool, post_id, "carol").await;

    let app = build_app(pool).await;
    let req = test::TestRequest::delete()
        .uri(&format!("/api/comments/{comment_id}"))
        .insert_header(common::user_auth_header("mallory"))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 403);

    let req = test::TestRequest::get()
        .uri(&format!("/api/posts/{post_id}/comments"))
        .to_request();
    let comments: Vec<Comment> = test::call_and_read_body_json(&app, req).await;
    assert_eq!(comments.len(), 1);
}

#[tokio::test]
async fn delete_own_comment_deletes_for_its_author() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "My Own Post", true).await;
    let comment_id = seed_comment_by(&pool, post_id, "carol").await;

    let app = build_app(pool).await;
    let req = test::TestRequest::delete()
        .uri(&format!("/api/comments/{comment_id}"))
        .insert_header(common::user_auth_header("carol"))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 204);

    let req = test::TestRequest::get()
        .uri(&format!("/api/posts/{post_id}/comments"))
        .to_request();
    let comments: Vec<Comment> = test::call_and_read_body_json(&app, req).await;
    assert!(comments.is_empty());
}

#[tokio::test]
async fn delete_own_comment_matches_the_login_case_insensitively() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "Casing Post", true).await;
    let comment_id = seed_comment_by(&pool, post_id, "Carol").await;

    let app = build_app(pool).await;
    let req = test::TestRequest::delete()
        .uri(&format!("/api/comments/{comment_id}"))
        .insert_header(common::user_auth_header("CAROL"))
        .to_request();

    assert_eq!(test::call_service(&app, req).await.status(), 204);
}

#[tokio::test]
async fn delete_own_comment_allows_admins_to_moderate() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_post(&pool, "Moderated Again", true).await;
    let comment_id = seed_comment_by(&pool, post_id, "mallory").await;

    let app = build_app(pool).await;
    let req = test::TestRequest::delete()
        .uri(&format!("/api/comments/{comment_id}"))
        .insert_header(common::auth_header())
        .to_request();

    assert_eq!(test::call_service(&app, req).await.status(), 204);
}
