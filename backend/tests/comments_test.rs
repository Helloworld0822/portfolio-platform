mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::Comment;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

async fn seed_post(pool: &PgPool, slug: &str, published: bool) -> Uuid {
    let (id,): (Uuid,) = sqlx::query_as(
        "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
         VALUES ($1, $2, 'an excerpt', '# body', $3)
         RETURNING id",
    )
    .bind(slug)
    .bind(slug)
    .bind(published)
    .fetch_one(pool)
    .await
    .expect("seeding a post should succeed");

    id
}

async fn seed_comment(pool: &PgPool, post_id: Uuid, author: &str, body: &str) {
    sqlx::query(
        "INSERT INTO comments (post_id, author_login, body) VALUES ($1, $2, $3)",
    )
    .bind(post_id)
    .bind(author)
    .bind(body)
    .execute(pool)
    .await
    .expect("seeding a comment should succeed");
}

#[sqlx::test(migrations = "./migrations")]
async fn list_comments_returns_an_empty_list_for_a_post_with_no_comments(pool: PgPool) {
    seed_post(&pool, "quiet-post", true).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/posts/quiet-post/comments")
        .to_request();
    let body: Vec<Comment> = test::call_and_read_body_json(&app, req).await;

    assert!(body.is_empty());
}

#[sqlx::test(migrations = "./migrations")]
async fn list_comments_returns_comments_oldest_first(pool: PgPool) {
    let post_id = seed_post(&pool, "chatty-post", true).await;
    seed_comment(&pool, post_id, "alice", "first!").await;
    seed_comment(&pool, post_id, "bob", "second").await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/posts/chatty-post/comments")
        .to_request();
    let body: Vec<Comment> = test::call_and_read_body_json(&app, req).await;

    assert_eq!(body.len(), 2);
    assert_eq!(body[0].author_login, "alice");
    assert_eq!(body[1].author_login, "bob");
}

#[sqlx::test(migrations = "./migrations")]
async fn list_comments_404s_for_an_unknown_slug(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/posts/does-not-exist/comments")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 404);
}

#[sqlx::test(migrations = "./migrations")]
async fn create_comment_requires_authentication(pool: PgPool) {
    seed_post(&pool, "needs-auth", true).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/posts/needs-auth/comments")
        .set_json(json!({ "body": "hello" }))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 401);
}

#[sqlx::test(migrations = "./migrations")]
async fn create_comment_saves_the_authenticated_users_login_and_returns_201(pool: PgPool) {
    seed_post(&pool, "great-post", true).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

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

#[sqlx::test(migrations = "./migrations")]
async fn create_comment_rejects_an_empty_body(pool: PgPool) {
    seed_post(&pool, "empty-body-post", true).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/posts/empty-body-post/comments")
        .insert_header(common::user_auth_header("carol"))
        .set_json(json!({ "body": "   " }))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 400);
}

#[sqlx::test(migrations = "./migrations")]
async fn create_comment_404s_for_an_unpublished_post(pool: PgPool) {
    seed_post(&pool, "still-a-draft", false).await;

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/posts/still-a-draft/comments")
        .insert_header(common::user_auth_header("carol"))
        .set_json(json!({ "body": "hello" }))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 404);
}

#[sqlx::test(migrations = "./migrations")]
async fn delete_comment_requires_admin(pool: PgPool) {
    let post_id = seed_post(&pool, "moderated-post", true).await;
    let (comment_id,): (Uuid,) = sqlx::query_as(
        "INSERT INTO comments (post_id, author_login, body) VALUES ($1, 'spammer', 'buy now')
         RETURNING id",
    )
    .bind(post_id)
    .fetch_one(&pool)
    .await
    .expect("seeding a comment should succeed");

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

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

#[sqlx::test(migrations = "./migrations")]
async fn delete_comment_returns_204_then_404(pool: PgPool) {
    let post_id = seed_post(&pool, "cleanup-post", true).await;
    let (comment_id,): (Uuid,) = sqlx::query_as(
        "INSERT INTO comments (post_id, author_login, body) VALUES ($1, 'spammer', 'buy now')
         RETURNING id",
    )
    .bind(post_id)
    .fetch_one(&pool)
    .await
    .expect("seeding a comment should succeed");

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

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
