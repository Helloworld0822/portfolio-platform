mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::ContactMessage;
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
async fn contact_form_stores_a_message(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool.clone()))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/contact")
        .set_json(json!({
            "name": "  방문자  ",
            "email": "visitor@example.com",
            "message": "포트폴리오 잘 봤습니다."
        }))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);

    let stored: ContactMessage = test::read_body_json(resp).await;
    assert_eq!(stored.name, "방문자");

    let (count,): (i64,) = sqlx::query_as("SELECT count(*) FROM contact_messages")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn contact_form_rejects_a_malformed_email(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/contact")
        .set_json(json!({
            "name": "방문자",
            "email": "not-an-email",
            "message": "안녕하세요"
        }))
        .to_request();

    assert_eq!(test::call_service(&app, req).await.status(), 400);
}

#[sqlx::test(migrations = "./migrations")]
async fn contact_form_rejects_an_empty_message(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/contact")
        .set_json(json!({
            "name": "방문자",
            "email": "visitor@example.com",
            "message": "   "
        }))
        .to_request();

    assert_eq!(test::call_service(&app, req).await.status(), 400);
}

#[sqlx::test(migrations = "./migrations")]
async fn the_inbox_is_admin_only(pool: PgPool) {
    sqlx::query(
        "INSERT INTO contact_messages (name, email, message)
         VALUES ('방문자', 'visitor@example.com', '문의드립니다')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let anonymous = test::TestRequest::get()
        .uri("/api/admin/contact")
        .to_request();
    assert_eq!(test::call_service(&app, anonymous).await.status(), 401);

    let authenticated = test::TestRequest::get()
        .uri("/api/admin/contact")
        .insert_header(common::auth_header())
        .to_request();
    let messages: Vec<ContactMessage> =
        test::call_and_read_body_json(&app, authenticated).await;
    assert_eq!(messages.len(), 1);
}
