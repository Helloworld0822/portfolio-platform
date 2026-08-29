use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::{CreateProjectRequest, Project, UpdateProjectRequest};

/// List every published portfolio project, newest first.
#[utoipa::path(
    get,
    path = "/api/projects",
    tag = "projects",
    responses((status = 200, description = "Published projects", body = Vec<Project>))
)]
pub async fn list_projects(pool: web::Data<PgPool>) -> Result<HttpResponse, AppError> {
    let projects: Vec<Project> =
        sqlx::query_as("SELECT * FROM projects WHERE published = true ORDER BY created_at DESC")
            .fetch_all(pool.get_ref())
            .await?;

    Ok(HttpResponse::Ok().json(projects))
}

/// List every project, unpublished included.
#[utoipa::path(
    get,
    path = "/api/admin/projects",
    tag = "admin/projects",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "All projects", body = Vec<Project>),
        (status = 401, description = "Missing or invalid token")
    )
)]
pub async fn list_admin_projects(
    pool: web::Data<PgPool>,
    _user: AdminUser,
) -> Result<HttpResponse, AppError> {
    let projects: Vec<Project> = sqlx::query_as("SELECT * FROM projects ORDER BY created_at DESC")
        .fetch_all(pool.get_ref())
        .await?;

    Ok(HttpResponse::Ok().json(projects))
}

/// Create a project.
#[utoipa::path(
    post,
    path = "/api/admin/projects",
    tag = "admin/projects",
    security(("bearer_auth" = [])),
    request_body = CreateProjectRequest,
    responses(
        (status = 201, description = "Created", body = Project),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid token")
    )
)]
pub async fn create_project(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    body: web::Json<CreateProjectRequest>,
) -> Result<HttpResponse, AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::Validation("title must not be empty".into()));
    }

    let project: Project = sqlx::query_as(
        "INSERT INTO projects (title, description, details, tags, status, period, role, url, published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *",
    )
    .bind(&body.title)
    .bind(&body.description)
    .bind(&body.details)
    .bind(&body.tags)
    .bind(&body.status)
    .bind(&body.period)
    .bind(&body.role)
    .bind(&body.url)
    .bind(body.published)
    .fetch_one(pool.get_ref())
    .await?;

    Ok(HttpResponse::Created().json(project))
}

/// Patch a project. Omitted fields keep their current value.
#[utoipa::path(
    put,
    path = "/api/admin/projects/{id}",
    tag = "admin/projects",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path, description = "Project id")),
    request_body = UpdateProjectRequest,
    responses(
        (status = 200, description = "Updated", body = Project),
        (status = 401, description = "Missing or invalid token"),
        (status = 404, description = "No project with that id")
    )
)]
pub async fn update_project(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
    body: web::Json<UpdateProjectRequest>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();

    let existing: Project = sqlx::query_as("SELECT * FROM projects WHERE id = $1")
        .bind(id)
        .fetch_optional(pool.get_ref())
        .await?
        .ok_or(AppError::NotFound)?;

    let title = body.title.clone().unwrap_or(existing.title);
    let description = body.description.clone().unwrap_or(existing.description);
    let details = body.details.clone().unwrap_or(existing.details);
    let tags = body.tags.clone().unwrap_or(existing.tags);
    let status = body.status.clone().unwrap_or(existing.status);
    let period = body.period.clone().or(existing.period);
    let role = body.role.clone().or(existing.role);
    let url = body.url.clone().or(existing.url);
    let published = body.published.unwrap_or(existing.published);

    let project: Project = sqlx::query_as(
        "UPDATE projects
         SET title = $1, description = $2, details = $3, tags = $4, status = $5,
             period = $6, role = $7, url = $8, published = $9, updated_at = now()
         WHERE id = $10
         RETURNING *",
    )
    .bind(&title)
    .bind(&description)
    .bind(&details)
    .bind(&tags)
    .bind(&status)
    .bind(&period)
    .bind(&role)
    .bind(&url)
    .bind(published)
    .bind(id)
    .fetch_one(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(project))
}

/// Delete a project.
#[utoipa::path(
    delete,
    path = "/api/admin/projects/{id}",
    tag = "admin/projects",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path, description = "Project id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid token"),
        (status = 404, description = "No project with that id")
    )
)]
pub async fn delete_project(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();

    let result = sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(id)
        .execute(pool.get_ref())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}
