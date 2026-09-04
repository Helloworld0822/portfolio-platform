use actix_web::{web, HttpResponse};
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::db::PgPool;
use crate::error::AppError;
use crate::models::{
    CreateTimelineRequest, ReorderTimelineRequest, TimelineEntry, UpdateTimelineRequest,
};

const DEFAULT_ORDER: &str = "ORDER BY sort_order ASC, created_at ASC";

async fn fetch_timeline(pool: &PgPool) -> Result<Vec<TimelineEntry>, AppError> {
    let conn = pool.get().await?;
    let rows = conn
        .query(
            &format!("SELECT * FROM timeline_entries {DEFAULT_ORDER}"),
            &[],
        )
        .await?;

    rows.iter()
        .map(TimelineEntry::try_from)
        .collect::<Result<Vec<_>, anyhow::Error>>()
        .map_err(AppError::from)
}

/// List timeline entries in display order. Public.
#[utoipa::path(
    get,
    path = "/api/timeline",
    tag = "timeline",
    responses((status = 200, description = "Timeline entries", body = Vec<TimelineEntry>))
)]
pub async fn list_timeline(pool: web::Data<PgPool>) -> Result<HttpResponse, AppError> {
    let entries = fetch_timeline(&pool).await?;
    Ok(HttpResponse::Ok().json(entries))
}

/// List timeline entries. Same data as the public endpoint, admin-gated.
#[utoipa::path(
    get,
    path = "/api/admin/timeline",
    tag = "admin/timeline",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "Timeline entries", body = Vec<TimelineEntry>),
        (status = 401, description = "Missing or invalid token")
    )
)]
pub async fn list_admin_timeline(
    pool: web::Data<PgPool>,
    _user: AdminUser,
) -> Result<HttpResponse, AppError> {
    let entries = fetch_timeline(&pool).await?;
    Ok(HttpResponse::Ok().json(entries))
}

fn validate_title(title: &str) -> Result<(), AppError> {
    if title.trim().is_empty() {
        return Err(AppError::Validation("title must not be empty".into()));
    }
    Ok(())
}

/// Append a timeline entry at the end of the list.
#[utoipa::path(
    post,
    path = "/api/admin/timeline",
    tag = "admin/timeline",
    security(("bearer_auth" = [])),
    request_body = CreateTimelineRequest,
    responses(
        (status = 201, description = "Created", body = TimelineEntry),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid token")
    )
)]
pub async fn create_timeline(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    body: web::Json<CreateTimelineRequest>,
) -> Result<HttpResponse, AppError> {
    validate_title(&body.title)?;

    let conn = pool.get().await?;
    let row = conn
        .query_one(
            "INSERT INTO timeline_entries (period, title, org, description, sort_order)
             VALUES ($1, $2, $3, $4,
                     (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM timeline_entries))
             RETURNING *",
            &[&body.period, &body.title, &body.org, &body.description],
        )
        .await?;

    let entry = TimelineEntry::try_from(&row)?;
    Ok(HttpResponse::Created().json(entry))
}

/// Patch a timeline entry. Omitted fields keep their current value.
#[utoipa::path(
    put,
    path = "/api/admin/timeline/{id}",
    tag = "admin/timeline",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path, description = "Timeline entry id")),
    request_body = UpdateTimelineRequest,
    responses(
        (status = 200, description = "Updated", body = TimelineEntry),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid token"),
        (status = 404, description = "No timeline entry with that id")
    )
)]
pub async fn update_timeline(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
    body: web::Json<UpdateTimelineRequest>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let existing_row = pool
        .get()
        .await?
        .query_opt("SELECT * FROM timeline_entries WHERE id = $1", &[&id])
        .await?
        .ok_or(AppError::NotFound)?;
    let existing = TimelineEntry::try_from(&existing_row)?;

    let title = body.title.clone().unwrap_or(existing.title);
    validate_title(&title)?;
    let period = body.period.clone().unwrap_or(existing.period);
    let org = body.org.clone().unwrap_or(existing.org);
    let description = body.description.clone().unwrap_or(existing.description);

    let conn = pool.get().await?;
    let row = conn
        .query_one(
            "UPDATE timeline_entries
             SET period = $1, title = $2, org = $3, description = $4, updated_at = now()
             WHERE id = $5
             RETURNING *",
            &[&period, &title, &org, &description, &id],
        )
        .await?;

    let entry = TimelineEntry::try_from(&row)?;
    Ok(HttpResponse::Ok().json(entry))
}

/// Delete a timeline entry.
#[utoipa::path(
    delete,
    path = "/api/admin/timeline/{id}",
    tag = "admin/timeline",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path, description = "Timeline entry id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid token"),
        (status = 404, description = "No timeline entry with that id")
    )
)]
pub async fn delete_timeline(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let conn = pool.get().await?;

    let affected = conn
        .execute("DELETE FROM timeline_entries WHERE id = $1", &[&id])
        .await?;

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}

/// Re-sort every timeline entry according to the supplied id order. The body
/// must contain the complete id list in the desired display order.
#[utoipa::path(
    post,
    path = "/api/admin/timeline/reorder",
    tag = "admin/timeline",
    security(("bearer_auth" = [])),
    request_body = ReorderTimelineRequest,
    responses(
        (status = 204, description = "Reordered"),
        (status = 401, description = "Missing or invalid token")
    )
)]
pub async fn reorder_timeline(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    body: web::Json<ReorderTimelineRequest>,
) -> Result<HttpResponse, AppError> {
    let mut conn = pool.get().await?;
    let tx = conn.transaction().await.map_err(anyhow::Error::from)?;

    for (index, id) in body.ids.iter().enumerate() {
        tx.execute(
            "UPDATE timeline_entries SET sort_order = $1, updated_at = now() WHERE id = $2",
            &[&(index as i32), id],
        )
        .await?;
    }

    tx.commit().await.map_err(anyhow::Error::from)?;
    Ok(HttpResponse::NoContent().finish())
}
