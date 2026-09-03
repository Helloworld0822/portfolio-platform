use actix_web::{web, HttpResponse};
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::config::Config;
use crate::db::PgPool;
use crate::error::AppError;
use crate::github_repo;
use crate::models::{CreateProjectRequest, Project, UpdateProjectRequest};

/// Best-effort: enrich a project with its GitHub repo's language breakdown and
/// privacy flag. Falls back to the supplied defaults when the URL is not a
/// GitHub repo or the API call fails.
async fn fetch_repo_meta(
    config: &Config,
    repo_url: Option<&str>,
    default: Option<(serde_json::Value, bool)>,
) -> (serde_json::Value, bool) {
    let Some(url) = repo_url else {
        return default.unwrap_or((serde_json::json!({}), false));
    };
    match github_repo::fetch_repo_meta(config, url).await {
        Some(meta) => (
            serde_json::to_value(meta.languages).unwrap_or(serde_json::json!({})),
            meta.is_private,
        ),
        None => {
            tracing::warn!(url, "failed to fetch repo meta; keeping defaults");
            default.unwrap_or((serde_json::json!({}), false))
        }
    }
}

/// Reject non-http(s) URL schemes (e.g. `javascript:`) that would become
/// script-execution vectors when rendered in an `<a href>` on the public site.
fn validate_url_scheme(url: Option<&str>) -> Result<(), AppError> {
    if let Some(url) = url {
        let scheme = url.split_once(':').map_or("", |(s, _)| s);
        if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
            return Err(AppError::Validation("url must use http(s)".into()));
        }
    }
    Ok(())
}

/// List every published portfolio project, newest first.
#[utoipa::path(
    get,
    path = "/api/projects",
    tag = "projects",
    responses((status = 200, description = "Published projects", body = Vec<Project>))
)]
pub async fn list_projects(pool: web::Data<PgPool>) -> Result<HttpResponse, AppError> {
    let conn = pool.get().await?;
    let rows = conn
        .query(
            "SELECT * FROM projects WHERE published = true ORDER BY created_at DESC",
            &[],
        )
        .await?;

    let projects: Vec<Project> = rows
        .iter()
        .map(Project::try_from)
        .collect::<Result<_, _>>()?;

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
    let conn = pool.get().await?;
    let rows = conn
        .query("SELECT * FROM projects ORDER BY created_at DESC", &[])
        .await?;

    let projects: Vec<Project> = rows
        .iter()
        .map(Project::try_from)
        .collect::<Result<_, _>>()?;

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
    config: web::Data<Config>,
    _user: AdminUser,
    body: web::Json<CreateProjectRequest>,
) -> Result<HttpResponse, AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::Validation("title must not be empty".into()));
    }
    validate_url_scheme(body.url.as_deref())?;
    validate_url_scheme(body.demo_url.as_deref())?;

    let (repo_languages, repo_private) = fetch_repo_meta(&config, body.url.as_deref(), None).await;
    let attachments = serde_json::to_value(&body.attachments).map_err(anyhow::Error::from)?;

    let conn = pool.get().await?;
    let row = conn
        .query_one(
            "INSERT INTO projects (title, description, details, tags, status, period, role, url, demo_url, repo_languages, repo_private, attachments, published)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *",
            &[
                &body.title,
                &body.description,
                &body.details,
                &body.tags,
                &body.status,
                &body.period,
                &body.role,
                &body.url,
                &body.demo_url,
                &repo_languages,
                &repo_private,
                &attachments,
                &body.published,
            ],
        )
        .await?;

    let project = Project::try_from(&row)?;
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
    config: web::Data<Config>,
    _user: AdminUser,
    path: web::Path<Uuid>,
    body: web::Json<UpdateProjectRequest>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let conn = pool.get().await?;

    let existing_row = conn
        .query_opt("SELECT * FROM projects WHERE id = $1", &[&id])
        .await?
        .ok_or(AppError::NotFound)?;
    let existing = Project::try_from(&existing_row)?;

    let title = body.title.clone().unwrap_or_else(|| existing.title.clone());
    let description = body
        .description
        .clone()
        .unwrap_or_else(|| existing.description.clone());
    let details = body
        .details
        .clone()
        .unwrap_or_else(|| existing.details.clone());
    let tags = body.tags.clone().unwrap_or_else(|| existing.tags.clone());
    let status = body
        .status
        .clone()
        .unwrap_or_else(|| existing.status.clone());
    let period = body.period.clone().or_else(|| existing.period.clone());
    let role = body.role.clone().or_else(|| existing.role.clone());
    let url = body.url.clone().or_else(|| existing.url.clone());
    let demo_url = body.demo_url.clone().or_else(|| existing.demo_url.clone());
    let attachments = body
        .attachments
        .clone()
        .unwrap_or_else(|| existing.attachments.clone());
    let published = body.published.unwrap_or(existing.published);

    validate_url_scheme(url.as_deref())?;
    validate_url_scheme(demo_url.as_deref())?;

    let url_changed = url.as_deref() != existing.url.as_deref();
    let (repo_languages, repo_private) = if url_changed {
        fetch_repo_meta(&config, url.as_deref(), None).await
    } else {
        (existing.repo_languages.clone(), existing.repo_private)
    };
    let attachments_json = serde_json::to_value(&attachments).map_err(anyhow::Error::from)?;

    let row = conn
        .query_one(
            "UPDATE projects
             SET title = $1, description = $2, details = $3, tags = $4, status = $5,
                 period = $6, role = $7, url = $8, demo_url = $9, repo_languages = $10,
                 repo_private = $11, attachments = $12, published = $13, updated_at = now()
             WHERE id = $14
             RETURNING *",
            &[
                &title,
                &description,
                &details,
                &tags,
                &status,
                &period,
                &role,
                &url,
                &demo_url,
                &repo_languages,
                &repo_private,
                &attachments_json,
                &published,
                &id,
            ],
        )
        .await?;

    let project = Project::try_from(&row)?;
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
    let conn = pool.get().await?;

    let affected = conn
        .execute("DELETE FROM projects WHERE id = $1", &[&id])
        .await?;

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}
