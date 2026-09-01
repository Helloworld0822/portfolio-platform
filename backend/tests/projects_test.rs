mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::Project;
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
async fn list_projects_returns_only_published() {
    let (pool, _db) = common::setup().await;
    {
        let conn = pool.get().await.expect("get connection");
        conn.execute(
            "INSERT INTO projects (title, description, details, tags, status, published)
             VALUES ('Live', 'shipped', ARRAY['a'], ARRAY['Rust'], '완료', true),
                    ('Hidden', 'wip', ARRAY['b'], ARRAY['React'], '진행 중', false)",
            &[],
        )
        .await
        .unwrap();
    }

    let app = build_app(pool).await;
    let req = test::TestRequest::get().uri("/api/projects").to_request();
    let projects: Vec<Project> = test::call_and_read_body_json(&app, req).await;

    // The 0005 seed migration preloads published projects, so assert the
    // semantics (unpublished excluded) rather than an exact count or order.
    let live = projects
        .iter()
        .find(|p| p.title == "Live")
        .expect("Live project");
    assert_eq!(live.tags, vec!["Rust".to_string()]);
    assert!(projects.iter().all(|p| p.published));
    assert!(!projects.iter().any(|p| p.title == "Hidden"));
}

#[tokio::test]
async fn create_project_requires_authentication() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
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

#[tokio::test]
async fn create_project_stores_arrays_and_optional_fields() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
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

#[tokio::test]
async fn update_project_patches_only_the_given_fields() {
    let (pool, _db) = common::setup().await;
    let original = {
        let conn = pool.get().await.expect("get connection");
        let row = conn
            .query_one(
                "INSERT INTO projects (title, description, details, tags, status, period, published)
                 VALUES ('Original', 'desc', ARRAY['d1'], ARRAY['t1'], '진행 중', '2026.01', false)
                 RETURNING *",
                &[],
            )
            .await
            .unwrap();
        Project::try_from(&row).unwrap()
    };

    let app = build_app(pool).await;
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
