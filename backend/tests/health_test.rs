use actix_web::{test, App};

use portfolio_blog_api::app::configure_app;

#[actix_web::test]
async fn health_returns_ok_status() {
    let app = test::init_service(App::new().configure(configure_app)).await;

    let req = test::TestRequest::get().uri("/api/health").to_request();
    let resp = test::call_service(&app, req).await;

    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["status"], "ok");
}
