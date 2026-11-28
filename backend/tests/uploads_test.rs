mod common;

use actix_web::{http::StatusCode, test, web, App};
use portfolio_blog_api::routes::uploads::upload_file;

#[actix_web::test]
async fn admin_can_upload_powerpoint_files() {
    let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
    let mut config = common::test_config();
    config.upload_dir = dir.to_str().unwrap().into();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(config))
            .route("/api/admin/uploads", web::post().to(upload_file)),
    )
    .await;
    for ext in ["ppt", "PPTX"] {
        let request = test::TestRequest::post()
            .uri("/api/admin/uploads")
            .insert_header(common::auth_header())
            .insert_header(("Content-Type", "multipart/form-data; boundary=test"))
            .set_payload(format!(
                "--test\r\nContent-Disposition: form-data; name=\"file\"; filename=\"slides.{ext}\"\r\n\r\nslides\r\n--test--\r\n"
            ))
            .to_request();
        let response = test::call_service(&app, request).await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let body: serde_json::Value = test::read_body_json(response).await;
        let name = body["url"]
            .as_str()
            .unwrap()
            .strip_prefix("/uploads/")
            .unwrap();
        assert!(name.ends_with(&format!(".{}", ext.to_lowercase())));
        assert_eq!(std::fs::read(dir.join(name)).unwrap(), b"slides");
    }
    std::fs::remove_dir_all(dir).unwrap();
}
