mod common;

use actix_web::body::{BoxBody, EitherBody};
use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::bans::BanGuard;
use serde_json::{json, Value};

async fn build_app(
    pool: common::PgPool,
) -> impl actix_web::dev::Service<
    actix_http::Request,
    Response = actix_web::dev::ServiceResponse<EitherBody<BoxBody>>,
    Error = actix_web::Error,
> {
    let bans = common::ban_store(&pool).await;
    test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .app_data(web::Data::new(bans))
            .configure(configure_app)
            .wrap(BanGuard),
    )
    .await
}

async fn seed_published_post(pool: &common::PgPool) -> i64 {
    let conn = pool.get().await.expect("get connection");
    let row = conn
        .query_one(
            "INSERT INTO posts (title, excerpt, content_markdown, published)
             VALUES ('Blocked Post', 'an excerpt', '# body', true)
             RETURNING id",
            &[],
        )
        .await
        .expect("seeding a post should succeed");

    row.get::<_, i64>("id")
}

async fn ban(
    app: &impl actix_web::dev::Service<
        actix_http::Request,
        Response = actix_web::dev::ServiceResponse<EitherBody<BoxBody>>,
        Error = actix_web::Error,
    >,
    ip: &str,
) -> u16 {
    let req = test::TestRequest::post()
        .uri("/api/admin/bans/ips")
        .insert_header(common::auth_header())
        .set_json(json!({ "ip": ip, "reason": "test" }))
        .to_request();

    test::call_service(app, req).await.status().as_u16()
}

#[tokio::test]
async fn a_banned_ip_is_rejected_on_every_route() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    assert_eq!(ban(&app, "203.0.113.9").await, 201);

    for uri in ["/api/health", "/api/posts", "/api/admin/bans"] {
        let req =
            common::as_client_ip(test::TestRequest::get().uri(uri), "203.0.113.9").to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            403,
            "{uri} should be blocked for a banned IP"
        );
    }

    let req = common::as_client_ip(test::TestRequest::get().uri("/api/health"), "198.51.100.4")
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 200);
}

#[tokio::test]
async fn an_admin_token_still_reaches_the_ban_api_from_a_banned_ip() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    assert_eq!(ban(&app, "203.0.113.9").await, 201);

    let req = common::as_client_ip(
        test::TestRequest::get()
            .uri("/api/admin/bans")
            .insert_header(common::auth_header()),
        "203.0.113.9",
    )
    .to_request();

    assert_eq!(test::call_service(&app, req).await.status(), 200);
}

#[tokio::test]
async fn bans_can_be_listed_and_lifted() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let req = test::TestRequest::post()
        .uri("/api/admin/bans/ips")
        .insert_header(common::auth_header())
        .set_json(json!({ "ip": "203.0.113.10", "reason": "spam", "duration_hours": 2 }))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 201);

    let req = test::TestRequest::get()
        .uri("/api/admin/bans")
        .insert_header(common::auth_header())
        .to_request();
    let body: Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(body["ips"][0]["ip"], "203.0.113.10");
    assert_eq!(body["ips"][0]["reason"], "spam");
    assert!(body["ips"][0]["expires_at"].is_string());

    let req = test::TestRequest::delete()
        .uri("/api/admin/bans/ips/203.0.113.10")
        .insert_header(common::auth_header())
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 204);

    let req = common::as_client_ip(test::TestRequest::get().uri("/api/health"), "203.0.113.10")
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 200);

    let req = test::TestRequest::delete()
        .uri("/api/admin/bans/ips/203.0.113.10")
        .insert_header(common::auth_header())
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 404);
}

#[tokio::test]
async fn managing_bans_requires_an_admin_token() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    for header in [None, Some(common::user_auth_header("carol"))] {
        let mut req = test::TestRequest::post().uri("/api/admin/bans/ips");
        if let Some(header) = header {
            req = req.insert_header(header);
        }
        let req = req.set_json(json!({ "ip": "203.0.113.11" })).to_request();
        assert_eq!(test::call_service(&app, req).await.status(), 401);
    }

    let req = test::TestRequest::get().uri("/api/admin/bans").to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 401);

    let req = test::TestRequest::post()
        .uri("/api/admin/bans/users")
        .insert_header(common::user_auth_header("carol"))
        .set_json(json!({ "login": "mallory" }))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 401);
}

#[tokio::test]
async fn private_and_malformed_addresses_cannot_be_banned() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    for ip in [
        "127.0.0.1",
        "10.0.0.5",
        "192.168.1.1",
        "172.18.0.1",
        "not-an-ip",
    ] {
        assert_eq!(ban(&app, ip).await, 400, "{ip} should be refused");
    }
}

#[tokio::test]
async fn the_configured_admin_account_cannot_be_blocked() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let req = test::TestRequest::post()
        .uri("/api/admin/bans/users")
        .insert_header(common::auth_header())
        .set_json(json!({ "login": common::ADMIN_USERNAME }))
        .to_request();

    assert_eq!(test::call_service(&app, req).await.status(), 400);
}

#[tokio::test]
async fn a_blocked_user_cannot_comment_but_others_still_can() {
    let (pool, _db) = common::setup().await;
    let post_id = seed_published_post(&pool).await;
    let app = build_app(pool).await;

    let req = test::TestRequest::post()
        .uri("/api/admin/bans/users")
        .insert_header(common::auth_header())
        .set_json(json!({ "login": "mallory", "reason": "abuse" }))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 201);

    let req = test::TestRequest::post()
        .uri(&format!("/api/posts/{post_id}/comments"))
        .insert_header(common::user_auth_header("mallory"))
        .set_json(json!({ "body": "hello" }))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 403);

    let req = test::TestRequest::post()
        .uri(&format!("/api/posts/{post_id}/comments"))
        .insert_header(common::user_auth_header("carol"))
        .set_json(json!({ "body": "hello" }))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 201);

    let req = test::TestRequest::delete()
        .uri("/api/admin/bans/users/mallory")
        .insert_header(common::auth_header())
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 204);

    let req = test::TestRequest::post()
        .uri(&format!("/api/posts/{post_id}/comments"))
        .insert_header(common::user_auth_header("mallory"))
        .set_json(json!({ "body": "hello again" }))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 201);
}

#[tokio::test]
async fn repeated_rate_limit_violations_temporarily_ban_the_ip() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let body = json!({ "name": "Spammer", "email": "spam@example.com", "message": "hi" });
    let mut throttled = 0;
    for _ in 0..15 {
        let req = common::as_client_ip(
            test::TestRequest::post()
                .uri("/api/contact")
                .set_json(body.clone()),
            "203.0.113.20",
        )
        .to_request();

        if test::call_service(&app, req).await.status() == 429 {
            throttled += 1;
        }
    }
    assert!(throttled > 0, "the contact limiter should reject repeats");

    let req = common::as_client_ip(test::TestRequest::get().uri("/api/health"), "203.0.113.20")
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 403);

    let req = test::TestRequest::get()
        .uri("/api/admin/bans")
        .insert_header(common::auth_header())
        .to_request();
    let bans: Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(bans["ips"][0]["ip"], "203.0.113.20");
    assert!(
        bans["ips"][0]["expires_at"].is_string(),
        "an automatic ban must expire on its own"
    );
}
