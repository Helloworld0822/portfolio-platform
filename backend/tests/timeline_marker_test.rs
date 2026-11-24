mod common;

use actix_web::{test, web, App};
use portfolio_blog_api::app::configure_app;
use portfolio_blog_api::models::{
    CreateTimelineRequest, TimelineEntry, TimelineMarkerColor, UpdateTimelineRequest,
};
use serde_json::json;

#[tokio::test]
async fn marker_requests_accept_supported_colors_and_reject_unknown_values() {
    let legacy = json!({"period": "2026", "title": "Award", "org": "Org", "description": ""});
    let request: CreateTimelineRequest = serde_json::from_value(legacy.clone()).unwrap();
    assert_eq!(request.marker_color, TimelineMarkerColor::Default);
    let update: UpdateTimelineRequest =
        serde_json::from_value(json!({"title": "Renamed"})).unwrap();
    assert_eq!(update.marker_color, None);
    for (value, expected) in [
        ("default", TimelineMarkerColor::Default),
        ("gold", TimelineMarkerColor::Gold),
        ("silver", TimelineMarkerColor::Silver),
        ("bronze", TimelineMarkerColor::Bronze),
    ] {
        let mut body = legacy.clone();
        body["marker_color"] = json!(value);
        let request: CreateTimelineRequest = serde_json::from_value(body).unwrap();
        assert_eq!(request.marker_color, expected);
        assert_eq!(
            serde_json::to_value(request.marker_color).unwrap(),
            json!(value)
        );
        let update: UpdateTimelineRequest =
            serde_json::from_value(json!({"marker_color": value})).unwrap();
        assert_eq!(update.marker_color, Some(expected));
    }
    for invalid in [
        json!("platinum"),
        json!("Gold"),
        json!(""),
        json!(42),
        json!({}),
    ] {
        let mut body = legacy.clone();
        body["marker_color"] = invalid.clone();
        assert!(serde_json::from_value::<CreateTimelineRequest>(body).is_err());
        assert!(
            serde_json::from_value::<UpdateTimelineRequest>(json!({"marker_color": invalid}))
                .is_err()
        );
    }
}

#[tokio::test]
async fn marker_color_persists_across_crud_and_legacy_updates() {
    let (pool, _db) = common::setup().await;
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(common::test_config()))
            .app_data(web::Data::new(pool.clone()))
            .configure(configure_app),
    )
    .await;
    for color in ["default", "gold", "silver", "bronze"] {
        let create = test::TestRequest::post()
            .uri("/api/admin/timeline")
            .insert_header(common::auth_header())
            .set_json(json!({"period": "2026", "title": "Award", "org": "Org", "description": "", "marker_color": color}))
            .to_request();
        let response = test::call_service(&app, create).await;
        assert_eq!(response.status(), 201);
        let created: TimelineEntry = test::read_body_json(response).await;
        assert_eq!(created.marker_color.as_str(), color);
        let legacy_update = test::TestRequest::put()
            .uri(&format!("/api/admin/timeline/{}", created.id))
            .insert_header(common::auth_header())
            .set_json(json!({"title": "Renamed"}))
            .to_request();
        let updated: TimelineEntry = test::call_and_read_body_json(&app, legacy_update).await;
        assert_eq!(updated.marker_color.as_str(), color);
        for endpoint in ["/api/timeline", "/api/admin/timeline"] {
            let list = test::TestRequest::get()
                .uri(endpoint)
                .insert_header(common::auth_header())
                .to_request();
            let entries: Vec<TimelineEntry> = test::call_and_read_body_json(&app, list).await;
            assert_eq!(
                entries
                    .iter()
                    .find(|entry| entry.id == created.id)
                    .unwrap()
                    .marker_color
                    .as_str(),
                color
            );
        }
        let reset = test::TestRequest::put()
            .uri(&format!("/api/admin/timeline/{}", created.id))
            .insert_header(common::auth_header())
            .set_json(json!({"marker_color": "default"}))
            .to_request();
        let updated: TimelineEntry = test::call_and_read_body_json(&app, reset).await;
        assert_eq!(updated.marker_color, TimelineMarkerColor::Default);
        let invalid_update = test::TestRequest::put()
            .uri(&format!("/api/admin/timeline/{}", created.id))
            .insert_header(common::auth_header())
            .set_json(json!({"marker_color": "platinum"}))
            .to_request();
        assert_eq!(test::call_service(&app, invalid_update).await.status(), 400);
    }
    let invalid_create = test::TestRequest::post()
        .uri("/api/admin/timeline")
        .insert_header(common::auth_header())
        .set_json(json!({"period": "2026", "title": "Award", "org": "Org", "description": "", "marker_color": "platinum"}))
        .to_request();
    assert_eq!(test::call_service(&app, invalid_create).await.status(), 400);
    let error = pool
        .get()
        .await
        .unwrap()
        .execute("UPDATE timeline_entries SET marker_color = 'platinum'", &[])
        .await
        .unwrap_err();
    assert_eq!(
        error.code(),
        Some(&tokio_postgres::error::SqlState::CHECK_VIOLATION)
    );
}
