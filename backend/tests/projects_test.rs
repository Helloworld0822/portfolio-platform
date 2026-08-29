mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::Project;
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
async fn list_projects_returns_only_published(pool: PgPool) {
    sqlx::query(
        "INSERT INTO projects (title, description, details, tags, status, published)
         VALUES ('Live', 'shipped', ARRAY['a'], ARRAY['Rust'], '완료', true),
                ('Hidden', 'wip', ARRAY['b'], ARRAY['React'], '진행 중', false)",
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

    let req = test::TestRequest::get().uri("/api/projects").to_request();
    let projects: Vec<Project> = test::call_and_read_body_json(&app, req).await;

    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].title, "Live");
    assert_eq!(projects[0].tags, vec!["Rust".to_string()]);
}

#[sqlx::test(migrations = "./migrations")]
async fn create_project_requires_authentication(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/admin/projects")
        .set_json(json!({
            "title": "No Auth",
            "description": "",
            "details": [],
            "tags": [],
            "status": "완료",
            "published": true
        }))
        .to_request();

    assert_eq!(test::call_service(&app, req).await.status(), 401);
}

#[sqlx::test(migrations = "./migrations")]
async fn create_project_stores_arrays_and_optional_fields(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool))
            .configure(configure_app),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/admin/projects")
        .insert_header(common::auth_header())
        .set_json(json!({
            "title": "포트폴리오 플랫폼",
            "description": "Rust + React 모노레포",
            "details": ["Actix-web API", "Swagger 문서"],
            "tags": ["Rust", "React", "Docker"],
            "status": "진행 중",
            "period": "2026.08 -",
            "role": "1인 개발",
            "url": null,
            "published": true
        }))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);

    let project: Project = test::read_body_json(resp).await;
    assert_eq!(project.details.len(), 2);
    assert_eq!(project.tags.len(), 3);
    assert_eq!(project.period.as_deref(), Some("2026.08 -"));
    assert_eq!(project.url, None);
}

#[sqlx::test(migrations = "./migrations")]
async fn update_project_patches_only_the_given_fields(pool: PgPool) {
    let original: Project = sqlx::query_as(
        "INSERT INTO projects (title, description, details, tags, status, period, published)
         VALUES ('Original', 'desc', ARRAY['d1'], ARRAY['t1'], '진행 중', '2026.01', false)
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
        .uri(&format!("/api/admin/projects/{}", original.id))
        .insert_header(common::auth_header())
        .set_json(json!({ "status": "완료", "published": true }))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    let updated: Project = test::read_body_json(resp).await;
    assert_eq!(updated.status, "완료");
    assert!(updated.published);
    assert_eq!(updated.title, "Original");
    assert_eq!(updated.details, vec!["d1".to_string()]);
    assert_eq!(updated.period.as_deref(), Some("2026.01"));
}
