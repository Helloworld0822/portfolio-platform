mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::Post;
use serde_json::json;
use uuid::Uuid;

async fn build_app(
    pool: common::PgPool,
) -> impl actix_web::dev::Service<
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
async fn create_post_derives_a_slug_and_returns_201() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
    let req = test::TestRequest::post()
        .uri("/api/admin/posts")
        .insert_header(common::auth_header())
        .set_json(json!({
            "title": "Hello Actix",
            "excerpt": "first post",
            "content_markdown": "# hi",
            "published": true
        }))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);

    let post: Post = test::read_body_json(resp).await;
    assert_eq!(post.slug, "hello-actix");
    assert!(post.published);
}

#[tokio::test]
async fn create_post_rejects_an_empty_title() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
    let req = test::TestRequest::post()
        .uri("/api/admin/posts")
        .insert_header(common::auth_header())
        .set_json(json!({
            "title": "   ",
            "excerpt": "",
            "content_markdown": "",
            "published": false
        }))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn update_post_patches_only_the_given_fields_and_keeps_the_slug() {
    let (pool, _db) = common::setup().await;
    let original = {
        let conn = pool.get().await.expect("get connection");
        let row = conn
            .query_one(
                "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
                 VALUES ('original-slug', 'Original', 'excerpt', 'body', false)
                 RETURNING *",
                &[],
            )
            .await
            .unwrap();
        Post::try_from(&row).unwrap()
    };

    let app = build_app(pool).await;
    let req = test::TestRequest::put()
        .uri(&format!("/api/admin/posts/{}", original.id))
        .insert_header(common::auth_header())
        .set_json(json!({ "published": true }))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    let updated: Post = test::read_body_json(resp).await;
    assert_eq!(updated.slug, "original-slug");
    assert_eq!(updated.title, "Original");
    assert_eq!(updated.excerpt, "excerpt");
    assert!(updated.published);
}

#[tokio::test]
async fn delete_post_returns_204_then_404() {
    let (pool, _db) = common::setup().await;
    let id = {
        let conn = pool.get().await.expect("get connection");
        let row = conn
            .query_one(
                "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
                 VALUES ('doomed', 'Doomed', '', '', true)
                 RETURNING id",
                &[],
            )
            .await
            .unwrap();
        row.get::<_, Uuid>("id")
    };

    let app = build_app(pool).await;
    let req = test::TestRequest::delete()
        .uri(&format!("/api/admin/posts/{id}"))
        .insert_header(common::auth_header())
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 204);

    let req = test::TestRequest::delete()
        .uri(&format!("/api/admin/posts/{id}"))
        .insert_header(common::auth_header())
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 404);
}

#[tokio::test]
async fn get_admin_post_returns_the_full_body_including_content_markdown() {
    let (pool, _db) = common::setup().await;
    let id = {
        let conn = pool.get().await.expect("get connection");
        let row = conn
            .query_one(
                "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
                 VALUES ('draft-post', 'Draft', 'short excerpt', '# body markdown', false)
                 RETURNING id",
                &[],
            )
            .await
            .unwrap();
        row.get::<_, Uuid>("id")
    };

    let app = build_app(pool).await;
    let req = test::TestRequest::get()
        .uri(&format!("/api/admin/posts/{id}"))
        .insert_header(common::auth_header())
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    let post: Post = test::read_body_json(resp).await;
    assert_eq!(post.slug, "draft-post");
    assert_eq!(post.content_markdown, "# body markdown");
    assert!(!post.published);
}

#[tokio::test]
async fn get_admin_post_returns_404_for_an_unknown_id() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
    let req = test::TestRequest::get()
        .uri("/api/admin/posts/00000000-0000-0000-0000-000000000000")
        .insert_header(common::auth_header())
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn get_admin_post_returns_401_without_a_token() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
    let req = test::TestRequest::get()
        .uri("/api/admin/posts/00000000-0000-0000-0000-000000000000")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 401);
}
