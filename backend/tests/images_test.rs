mod common;

use actix_web::{http::StatusCode, test, web, App};
use base64::{engine::general_purpose::STANDARD, Engine};
use portfolio_blog_api::app::configure_app;
use serde_json::{json, Value};
use wiremock::{
    matchers::{body_partial_json, header, method, path},
    Mock, MockServer, ResponseTemplate,
};

const ENDPOINT: &str = "/api/admin/images/generate";
const PNG: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

#[actix_web::test]
async fn admin_and_prompt_are_required_and_missing_key_returns_503() {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .configure(configure_app),
    )
    .await;
    for (token, prompt, expected) in [
        (None, "image".to_string(), StatusCode::UNAUTHORIZED),
        (
            Some(common::user_auth_header("reader")),
            "image".into(),
            StatusCode::UNAUTHORIZED,
        ),
        (
            Some(common::auth_header()),
            "  ".into(),
            StatusCode::BAD_REQUEST,
        ),
        (
            Some(common::auth_header()),
            "🍎".repeat(501),
            StatusCode::BAD_REQUEST,
        ),
        (
            Some(common::auth_header()),
            "image".into(),
            StatusCode::SERVICE_UNAVAILABLE,
        ),
    ] {
        let mut req = test::TestRequest::post()
            .uri(ENDPOINT)
            .set_json(json!({"prompt":prompt}));
        if let Some(auth) = token {
            req = req.insert_header(auth);
        }
        assert_eq!(
            test::call_service(&app, req.to_request()).await.status(),
            expected
        );
    }
}

#[actix_web::test]
async fn generated_url_serves_the_provider_png_and_provider_errors_are_private() {
    let server = MockServer::start().await;
    let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir(&dir).unwrap();
    let mut config = common::test_config();
    config.openai_api_key = Some("mock-key".into());
    config.image_generation_url = format!("{}/v1/images/generations", server.uri());
    config.upload_dir = dir.to_string_lossy().into_owned();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .configure(configure_app)
            .service(actix_files::Files::new("/uploads", &dir)),
    )
    .await;
    for (prompt, provider) in [
        (
            "poster",
            ResponseTemplate::new(200).set_body_json(json!({"data":[{"b64_json":PNG}]})),
        ),
        (
            "rejected",
            ResponseTemplate::new(429).set_body_string("private provider detail"),
        ),
        (
            "invalid",
            ResponseTemplate::new(200).set_body_json(json!({"data":[{"b64_json":"AAAA"}]})),
        ),
    ] {
        Mock::given(method("POST"))
            .and(path("/v1/images/generations"))
            .and(header("Authorization", "Bearer mock-key"))
            .and(body_partial_json(
                json!({"prompt":prompt,"n":1,"output_format":"png"}),
            ))
            .respond_with(provider)
            .expect(1)
            .mount(&server)
            .await;
        let req = test::TestRequest::post()
            .uri(ENDPOINT)
            .insert_header(common::auth_header())
            .set_json(json!({"prompt":format!(" {prompt} ")}))
            .to_request();
        let res = test::call_service(&app, req).await;
        if prompt == "poster" {
            assert_eq!(res.status(), StatusCode::CREATED);
            let json: Value = test::read_body_json(res).await;
            let url = json["url"].as_str().unwrap();
            let id = url
                .strip_prefix("/uploads/")
                .unwrap()
                .strip_suffix(".png")
                .unwrap();
            assert!(uuid::Uuid::parse_str(id).is_ok());
            let res =
                test::call_service(&app, test::TestRequest::get().uri(url).to_request()).await;
            assert_eq!(res.status(), StatusCode::OK);
            assert_eq!(
                &test::read_body(res).await[..],
                STANDARD.decode(PNG).unwrap()
            );
        } else {
            assert_eq!(res.status(), StatusCode::BAD_GATEWAY);
            assert_eq!(
                test::read_body_json::<Value, _>(res).await,
                json!({"error":"image_generation_failed"})
            );
        }
    }
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
    std::fs::remove_dir_all(dir).unwrap();
}
