mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::auth::jwt::issue_jwt;
use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
async fn admin_route_rejects_a_missing_header(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get().uri("/api/admin/posts").to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 401);
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_route_rejects_a_token_signed_with_another_secret(pool: PgPool) {
    let foreign_token =
        issue_jwt(common::ADMIN_USERNAME, "admin", None, "not-the-server-secret").unwrap();

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/admin/posts")
        .insert_header(("Authorization", format!("Bearer {foreign_token}")))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 401);
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_route_rejects_a_user_role_token(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/admin/posts")
        .insert_header(common::user_auth_header("someone-else"))
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 401);
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_route_accepts_a_valid_token(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/api/admin/posts")
        .insert_header(common::auth_header())
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 200);
}
