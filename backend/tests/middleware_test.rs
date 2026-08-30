mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::auth::jwt::issue_jwt;

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
async fn admin_route_rejects_a_missing_header() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let req = test::TestRequest::get().uri("/api/admin/posts").to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn admin_route_rejects_a_token_signed_with_another_secret() {
    let (pool, _db) = common::setup().await;
    let foreign_token =
        issue_jwt(common::ADMIN_USERNAME, "admin", None, "not-the-server-secret").unwrap();

    let app = build_app(pool).await;
    let req = test::TestRequest::get()
        .uri("/api/admin/posts")
        .insert_header(("Authorization", format!("Bearer {foreign_token}")))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn admin_route_rejects_a_user_role_token() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let req = test::TestRequest::get()
        .uri("/api/admin/posts")
        .insert_header(common::user_auth_header("someone-else"))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn admin_route_accepts_a_valid_token() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let req = test::TestRequest::get()
        .uri("/api/admin/posts")
        .insert_header(common::auth_header())
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 200);
}