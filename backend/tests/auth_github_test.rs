mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::config::Config;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn location(resp: &actix_web::dev::ServiceResponse) -> String {
    resp.headers()
        .get("Location")
        .expect("a redirect should carry a Location header")
        .to_str()
        .unwrap()
        .to_string()
}

fn config_pointing_at(server: &MockServer) -> Config {
    Config {
        github_oauth_base_url: server.uri(),
        github_api_base_url: server.uri(),
        ..common::test_config()
    }
}

async fn mock_token_endpoint(server: &MockServer, token: &str) {
    Mock::given(method("POST"))
        .and(path("/login/oauth/access_token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "access_token": token
        })))
        .mount(server)
        .await;
}

async fn mock_user_endpoint(server: &MockServer, login: &str) {
    Mock::given(method("GET"))
        .and(path("/user"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "login": login })),
        )
        .mount(server)
        .await;
}

async fn build_app(
    pool: common::PgPool,
) -> impl actix_web::dev::Service<
    actix_http::Request,
    Response = actix_web::dev::ServiceResponse,
    Error = actix_web::Error,
> {
    build_app_with_config(pool, common::test_config()).await
}

async fn build_app_with_config(
    pool: common::PgPool,
    config: Config,
) -> impl actix_web::dev::Service<
    actix_http::Request,
    Response = actix_web::dev::ServiceResponse,
    Error = actix_web::Error,
> {
    let bans = common::ban_store(&pool).await;
    build_app_with_bans(pool, config, bans).await
}

async fn build_app_with_bans(
    pool: common::PgPool,
    config: Config,
    bans: portfolio_blog_api::bans::BanStore,
) -> impl actix_web::dev::Service<
    actix_http::Request,
    Response = actix_web::dev::ServiceResponse,
    Error = actix_web::Error,
> {
    test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .app_data(web::Data::new(pool))
            .app_data(web::Data::new(bans))
            .configure(configure_app),
    )
    .await
}

#[tokio::test]
async fn login_redirects_to_github() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let req = test::TestRequest::get()
        .uri("/api/auth/github/login")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 302);
    let target = location(&resp);
    assert!(target.starts_with("http://localhost:0/login/oauth/authorize"));
    assert!(target.contains("client_id=test-client-id"));
    assert!(target.contains("scope=read:user"));
}

#[tokio::test]
async fn callback_without_a_code_redirects_with_an_error() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let req = test::TestRequest::get()
        .uri("/api/auth/github/callback")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 302);
    assert_eq!(location(&resp), "http://localhost:5173/?error=unauthorized");
}

#[tokio::test]
async fn callback_issues_a_token_for_the_admin() {
    let (pool, _db) = common::setup().await;
    let server = MockServer::start().await;
    mock_token_endpoint(&server, "gho_test_token").await;
    mock_user_endpoint(&server, common::ADMIN_USERNAME).await;

    let app = build_app_with_config(pool, config_pointing_at(&server)).await;

    let req = test::TestRequest::get()
        .uri("/api/auth/github/callback?code=valid-code")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 302);
    let target = location(&resp);
    assert!(
        target.starts_with("http://localhost:5173/admin#token="),
        "unexpected redirect: {target}"
    );

    let token = target.rsplit("token=").next().unwrap();
    let claims = portfolio_blog_api::auth::jwt::validate_jwt(token, common::JWT_SECRET)
        .expect("the issued token should validate");
    assert_eq!(claims.sub, common::ADMIN_USERNAME);
    assert_eq!(claims.role, "admin");
}

#[tokio::test]
async fn callback_issues_a_user_token_for_a_non_admin_github_user() {
    let (pool, _db) = common::setup().await;
    let server = MockServer::start().await;
    mock_token_endpoint(&server, "gho_test_token").await;
    mock_user_endpoint(&server, "someone-else").await;

    let app = build_app_with_config(pool, config_pointing_at(&server)).await;

    let req = test::TestRequest::get()
        .uri("/api/auth/github/callback?code=valid-code")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 302);
    let target = location(&resp);
    assert!(
        target.starts_with("http://localhost:5173/#token="),
        "unexpected redirect: {target}"
    );

    let token = target.rsplit("token=").next().unwrap();
    let claims = portfolio_blog_api::auth::jwt::validate_jwt(token, common::JWT_SECRET)
        .expect("the issued token should validate");
    assert_eq!(claims.sub, "someone-else");
    assert_eq!(claims.role, "user");
}

#[tokio::test]
async fn callback_redirects_a_non_admin_user_to_the_state_path() {
    let (pool, _db) = common::setup().await;
    let server = MockServer::start().await;
    mock_token_endpoint(&server, "gho_test_token").await;
    mock_user_endpoint(&server, "someone-else").await;

    let app = build_app_with_config(pool, config_pointing_at(&server)).await;

    let req = test::TestRequest::get()
        .uri("/api/auth/github/callback?code=valid-code&state=%2Fblog%2Fhello-world")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 302);
    let target = location(&resp);
    assert!(
        target.starts_with("http://localhost:5173/blog/hello-world#token="),
        "unexpected redirect: {target}"
    );
}

#[tokio::test]
async fn callback_ignores_a_state_that_would_leave_the_frontend_origin() {
    let (pool, _db) = common::setup().await;
    let server = MockServer::start().await;
    mock_token_endpoint(&server, "gho_test_token").await;
    mock_user_endpoint(&server, "someone-else").await;

    let app = build_app_with_config(pool, config_pointing_at(&server)).await;

    for state in [
        "%2F%2Fevil.example",
        "%40evil.example",
        "https%3A%2F%2Fevil.example",
    ] {
        let req = test::TestRequest::get()
            .uri(&format!(
                "/api/auth/github/callback?code=valid-code&state={state}"
            ))
            .to_request();
        let resp = test::call_service(&app, req).await;

        assert_eq!(resp.status(), 302);
        let target = location(&resp);
        assert!(
            target.starts_with("http://localhost:5173/#token="),
            "state {state} escaped the frontend origin: {target}"
        );
        assert!(
            !target.contains("evil.example"),
            "state {state} leaked: {target}"
        );
    }
}

#[tokio::test]
async fn callback_refuses_to_log_in_a_blocked_user() {
    let (pool, _db) = common::setup().await;
    let server = MockServer::start().await;
    mock_token_endpoint(&server, "gho_test_token").await;
    mock_user_endpoint(&server, "mallory").await;

    let bans = common::ban_store(&pool).await;
    bans.block_user("mallory", Some("abuse"))
        .await
        .expect("blocking should persist");

    let app = build_app_with_bans(pool, config_pointing_at(&server), bans).await;

    let req = test::TestRequest::get()
        .uri("/api/auth/github/callback?code=valid-code")
        .to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), 302);
    let target = location(&resp);
    assert_eq!(target, "http://localhost:5173/?error=blocked");
    assert!(
        !target.contains("token="),
        "a blocked user must not receive a token"
    );
}
