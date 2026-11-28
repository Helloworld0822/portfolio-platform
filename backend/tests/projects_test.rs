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
async fn public_detail_hides_drafts_and_reads_the_stored_profile() {
    let (pool, _db) = common::setup().await;
    let conn = pool.get().await.unwrap();
    let id: uuid::Uuid = conn
        .query_one("SELECT id FROM projects WHERE published LIMIT 1", &[])
        .await
        .unwrap()
        .get(0);
    let app = build_app(pool.clone()).await;
    let uri = format!("/api/projects/{id}");
    let get = || test::TestRequest::get().uri(&uri).to_request();
    let project: Project = test::call_and_read_body_json(&app, get()).await;
    assert_eq!(project.id, id);
    conn.execute("UPDATE projects SET published=false WHERE id=$1", &[&id])
        .await
        .unwrap();
    assert_eq!(test::call_service(&app, get()).await.status(), 404);

    conn.execute("UPDATE portfolio_profile SET content=jsonb_set(content, '{name}', to_jsonb('Test owner'::text))", &[]).await.unwrap();
    let req = test::TestRequest::get().uri("/api/profile").to_request();
    let profile: serde_json::Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(profile["name"], "Test owner");
    assert!(profile["skills"].is_array());
    assert_eq!(profile["photo"], "/images/jaemin.jpg");
    let mut updated = profile;
    updated["name"] = json!("Updated owner");
    let update = || {
        test::TestRequest::put()
            .uri("/api/admin/profile")
            .set_json(&updated)
    };
    assert_eq!(
        test::call_service(&app, update().to_request())
            .await
            .status(),
        401
    );
    assert_eq!(
        test::call_service(
            &app,
            update().insert_header(common::auth_header()).to_request()
        )
        .await
        .status(),
        200
    );
    updated["photo"] = json!("javascript:alert(1)");
    let invalid = test::TestRequest::put()
        .uri("/api/admin/profile")
        .insert_header(common::auth_header())
        .set_json(&updated)
        .to_request();
    assert_eq!(test::call_service(&app, invalid).await.status(), 400);
    let public: serde_json::Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get().uri("/api/profile").to_request(),
    )
    .await;
    assert_eq!(public["name"], "Updated owner");
    assert_ne!(public["photo"], updated["photo"]);
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
            "attachments": [{"name":"Pitch","kind":"presentation","url":"/uploads/example.pptx"}],
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
    assert_eq!(project.attachments[0].kind, "presentation");
    let uri = format!("/api/admin/projects/{}", project.id);
    let replacement = json!({"kind":"presentation","name":"Revised","url":"/uploads/revised.ppt"});
    let update = test::TestRequest::put()
        .uri(&uri)
        .insert_header(common::auth_header())
        .set_json(json!({"attachments": [replacement]}))
        .to_request();
    assert_eq!(test::call_service(&app, update).await.status(), 200);
    let read = test::TestRequest::get()
        .uri(&format!("/api/projects/{}", project.id))
        .to_request();
    let saved: Project = test::call_and_read_body_json(&app, read).await;
    assert_eq!(
        serde_json::to_value(saved.attachments).unwrap(),
        json!([replacement])
    );
}

#[tokio::test]
async fn create_project_stores_demo_url_and_rejects_bad_scheme() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
    let ok = test::TestRequest::post()
        .uri("/api/admin/projects")
        .insert_header(common::auth_header())
        .set_json(json!({
            "title": "With Demo",
            "description": "",
            "details": [],
            "tags": [],
            "status": "완료",
            "url": "https://github.com/me/demo",
            "demo_url": "https://demo.example.com",
            "published": true
        }))
        .to_request();

    let resp = test::call_service(&app, ok).await;
    assert_eq!(resp.status(), 201);
    let project: Project = test::read_body_json(resp).await;
    assert_eq!(
        project.demo_url.as_deref(),
        Some("https://demo.example.com")
    );
    assert_eq!(project.url.as_deref(), Some("https://github.com/me/demo"));

    let bad = test::TestRequest::post()
        .uri("/api/admin/projects")
        .insert_header(common::auth_header())
        .set_json(json!({
            "title": "Bad Scheme",
            "description": "",
            "details": [],
            "tags": [],
            "status": "완료",
            "demo_url": "javascript:alert(1)",
            "published": true
        }))
        .to_request();

    let resp = test::call_service(&app, bad).await;
    assert_eq!(resp.status(), 400);
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

#[tokio::test]
async fn update_project_sets_demo_url_and_rejects_bad_scheme() {
    let (pool, _db) = common::setup().await;
    let original = {
        let conn = pool.get().await.expect("get connection");
        let row = conn
            .query_one(
                "INSERT INTO projects (title, description, details, tags, status, published)
                 VALUES ('DemoBase', 'desc', ARRAY['d1'], ARRAY['t1'], '진행 중', false)
                 RETURNING *",
                &[],
            )
            .await
            .unwrap();
        Project::try_from(&row).unwrap()
    };

    let app = build_app(pool).await;
    let ok = test::TestRequest::put()
        .uri(&format!("/api/admin/projects/{}", original.id))
        .insert_header(common::auth_header())
        .set_json(json!({ "demo_url": "https://demo.example.com" }))
        .to_request();

    let resp = test::call_service(&app, ok).await;
    assert_eq!(resp.status(), 200);
    let updated: Project = test::read_body_json(resp).await;
    assert_eq!(
        updated.demo_url.as_deref(),
        Some("https://demo.example.com")
    );

    let bad = test::TestRequest::put()
        .uri(&format!("/api/admin/projects/{}", original.id))
        .insert_header(common::auth_header())
        .set_json(json!({ "demo_url": "data:text/html,x" }))
        .to_request();

    let resp = test::call_service(&app, bad).await;
    assert_eq!(resp.status(), 400);
}
