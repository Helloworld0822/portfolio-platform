mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::{TimelineEntry, TimelineMarkerColor};
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
async fn list_timeline_returns_seeded_entries_in_order() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
    let req = test::TestRequest::get().uri("/api/timeline").to_request();
    let entries: Vec<TimelineEntry> = test::call_and_read_body_json(&app, req).await;

    // The 0008 migration seeds four entries with sort_order 0..=3.
    assert_eq!(entries.len(), 4);
    assert!(entries
        .iter()
        .all(|entry| entry.marker_color == TimelineMarkerColor::Default));
    let orders: Vec<i32> = entries.iter().map(|e| e.sort_order).collect();
    let mut sorted = orders.clone();
    sorted.sort_unstable();
    assert_eq!(orders, sorted, "timeline must be in sort_order");
}

#[tokio::test]
async fn timeline_admin_endpoints_require_authentication() {
    let (pool, _db) = common::setup().await;

    let app = build_app(pool).await;
    let get_req = test::TestRequest::get()
        .uri("/api/admin/timeline")
        .to_request();
    assert_eq!(test::call_service(&app, get_req).await.status(), 401);

    let post_req = test::TestRequest::post()
        .uri("/api/admin/timeline")
        .set_json(json!({
            "period": "2026.09",
            "title": "No Auth",
            "org": "x",
            "description": ""
        }))
        .to_request();
    assert_eq!(test::call_service(&app, post_req).await.status(), 401);

    let reorder_req = test::TestRequest::post()
        .uri("/api/admin/timeline/reorder")
        .set_json(json!({ "ids": [] }))
        .to_request();
    assert_eq!(test::call_service(&app, reorder_req).await.status(), 401);

    let repos_req = test::TestRequest::get()
        .uri("/api/admin/github/repos")
        .to_request();
    assert_eq!(test::call_service(&app, repos_req).await.status(), 401);
}

#[tokio::test]
async fn create_update_delete_timeline_entries() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let create_req = test::TestRequest::post()
        .uri("/api/admin/timeline")
        .insert_header(common::auth_header())
        .set_json(json!({
            "period": "2026.09",
            "title": "새 경력",
            "org": "조직",
            "description": "설명",
            "attachments": [
                { "kind": "icon", "name": "학교 로고", "url": "/uploads/b054405a-b047-4aaa-88ab-ab6fd677d1b3.svg" },
                { "kind": "image", "name": "발표 사진", "url": "/uploads/e6c224e0-740a-4b1b-83d2-9e1c822307a6.jpg" }
            ],
            "icon_url": "/uploads/550e8400-e29b-41d4-a716-446655440000.png"
        }))
        .to_request();
    let resp = test::call_service(&app, create_req).await;
    assert_eq!(resp.status(), 201);
    let created: TimelineEntry = test::read_body_json(resp).await;
    assert_eq!(created.title, "새 경력");
    assert_eq!(created.marker_color, TimelineMarkerColor::Default);
    assert_eq!(
        created.icon_url,
        "/uploads/550e8400-e29b-41d4-a716-446655440000.png"
    );

    let update_req = test::TestRequest::put()
        .uri(&format!("/api/admin/timeline/{}", created.id))
        .insert_header(common::auth_header())
        .set_json(json!({ "title": "바뀐 제목" }))
        .to_request();
    let resp = test::call_service(&app, update_req).await;
    assert_eq!(resp.status(), 200);
    let updated: TimelineEntry = test::read_body_json(resp).await;
    assert_eq!(updated.title, "바뀐 제목");
    assert_eq!(updated.org, "조직", "untouched field stays");
    assert_eq!(updated.attachments.len(), 2);
    assert_eq!(updated.attachments[0].kind, "icon");

    let clear_media = test::TestRequest::put()
        .uri(&format!("/api/admin/timeline/{}", created.id))
        .insert_header(common::auth_header())
        .set_json(json!({ "attachments": [] }))
        .to_request();
    let cleared: TimelineEntry = test::call_and_read_body_json(&app, clear_media).await;
    assert!(cleared.attachments.is_empty());
    assert_eq!(updated.icon_url, created.icon_url);

    let public_req = test::TestRequest::get().uri("/api/timeline").to_request();
    let entries: Vec<TimelineEntry> = test::call_and_read_body_json(&app, public_req).await;
    assert_eq!(
        entries
            .iter()
            .find(|entry| entry.id == created.id)
            .unwrap()
            .icon_url,
        created.icon_url
    );

    let invalid_req = test::TestRequest::put()
        .uri(&format!("/api/admin/timeline/{}", created.id))
        .insert_header(common::auth_header())
        .set_json(json!({ "icon_url": "javascript:alert(1)" }))
        .to_request();
    assert_eq!(test::call_service(&app, invalid_req).await.status(), 400);

    let clear_req = test::TestRequest::put()
        .uri(&format!("/api/admin/timeline/{}", created.id))
        .insert_header(common::auth_header())
        .set_json(json!({ "icon_url": "" }))
        .to_request();
    let cleared: TimelineEntry = test::call_and_read_body_json(&app, clear_req).await;
    assert!(cleared.icon_url.is_empty());

    let delete_req = test::TestRequest::delete()
        .uri(&format!("/api/admin/timeline/{}", created.id))
        .insert_header(common::auth_header())
        .to_request();
    let resp = test::call_service(&app, delete_req).await;
    assert_eq!(resp.status(), 204);

    let missing_req = test::TestRequest::delete()
        .uri(&format!("/api/admin/timeline/{}", created.id))
        .insert_header(common::auth_header())
        .to_request();
    assert_eq!(test::call_service(&app, missing_req).await.status(), 404);
}

#[tokio::test]
async fn create_timeline_rejects_empty_title_and_appends_reorder() {
    let (pool, _db) = common::setup().await;
    let app = build_app(pool).await;

    let bad_req = test::TestRequest::post()
        .uri("/api/admin/timeline")
        .insert_header(common::auth_header())
        .set_json(json!({
            "period": "2026.09",
            "title": "   ",
            "org": "x",
            "description": ""
        }))
        .to_request();
    assert_eq!(test::call_service(&app, bad_req).await.status(), 400);

    // Append two entries; each gets the next sort_order.
    let mut ids = Vec::new();
    for title in ["A", "B"] {
        let req = test::TestRequest::post()
            .uri("/api/admin/timeline")
            .insert_header(common::auth_header())
            .set_json(json!({
                "period": "2026.10",
                "title": title,
                "org": "org",
                "description": ""
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 201);
        let entry: TimelineEntry = test::read_body_json(resp).await;
        ids.push(entry.id);
    }

    let get_req = test::TestRequest::get().uri("/api/timeline").to_request();
    let entries: Vec<TimelineEntry> = test::call_and_read_body_json(&app, get_req).await;
    assert_eq!(entries.len(), 6, "4 seeded + 2 appended");
    let last_two = &entries[entries.len() - 2..];
    assert_eq!(
        last_two.iter().map(|e| e.sort_order).collect::<Vec<_>>(),
        vec![4, 5]
    );

    let mut ordered_ids: Vec<uuid::Uuid> = entries.iter().map(|e| e.id).collect();
    let n = ordered_ids.len();
    ordered_ids.swap(n - 1, n - 2);
    let reorder_req = test::TestRequest::post()
        .uri("/api/admin/timeline/reorder")
        .insert_header(common::auth_header())
        .set_json(json!({ "ids": ordered_ids }))
        .to_request();
    assert_eq!(test::call_service(&app, reorder_req).await.status(), 204);

    let get_req = test::TestRequest::get().uri("/api/timeline").to_request();
    let entries: Vec<TimelineEntry> = test::call_and_read_body_json(&app, get_req).await;
    let last_two_ids: Vec<uuid::Uuid> = entries[entries.len() - 2..].iter().map(|e| e.id).collect();
    assert_eq!(
        last_two_ids,
        vec![ordered_ids[n - 2], ordered_ids[n - 1]],
        "reorder swapped the appended pair"
    );
}
