mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::ContactMessage;
use serde_json::json;

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
async fn contact_form_stores_a_message() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool.clone()).await;
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

    let conn = pool.get().await.expect("get connection");
    let row = conn
        .query_one("SELECT count(*) FROM contact_messages", &[])
        .await
        .unwrap();
    let count: i64 = row.get(0);
    assert_eq!(count, 1);
}

#[tokio::test]
async fn contact_form_rejects_a_malformed_email() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
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

#[tokio::test]
async fn contact_form_rejects_an_empty_message() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
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

#[tokio::test]
async fn the_inbox_is_admin_only() {
    let (pool, _db) = common::setup().await;

    {
        let conn = pool.get().await.expect("get connection");
        conn.execute(
            "INSERT INTO contact_messages (name, email, message)
             VALUES ('방문자', 'visitor@example.com', '문의드립니다')",
            &[],
        )
        .await
        .unwrap();
    }

    let app = build_app(pool).await;
    let anonymous = test::TestRequest::get()
        .uri("/api/admin/contact")
        .to_request();
    assert_eq!(test::call_service(&app, anonymous).await.status(), 401);

    let authenticated = test::TestRequest::get()
        .uri("/api/admin/contact")
        .insert_header(common::auth_header())
        .to_request();
    let messages: Vec<ContactMessage> = test::call_and_read_body_json(&app, authenticated).await;
    assert_eq!(messages.len(), 1);
}
