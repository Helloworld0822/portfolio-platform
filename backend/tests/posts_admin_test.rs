mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::Post;
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
async fn create_post_derives_a_slug_and_returns_201(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

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

#[sqlx::test(migrations = "./migrations")]
async fn create_post_rejects_an_empty_title(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

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

#[sqlx::test(migrations = "./migrations")]
async fn update_post_patches_only_the_given_fields_and_keeps_the_slug(pool: PgPool) {
    let original: Post = sqlx::query_as(
        "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
         VALUES ('original-slug', 'Original', 'excerpt', 'body', false)
         RETURNING *",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

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

#[sqlx::test(migrations = "./migrations")]
async fn delete_post_returns_204_then_404(pool: PgPool) {
    let (id,): (uuid::Uuid,) = sqlx::query_as(
        "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
         VALUES ('doomed', 'Doomed', '', '', true)
         RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

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
