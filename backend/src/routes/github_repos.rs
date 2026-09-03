use actix_web::{web, HttpResponse};

use crate::auth::middleware::AdminUser;
use crate::config::Config;
use crate::error::AppError;
use crate::github_repo;

/// List the GitHub repositories visible to the admin's token/profile so the
/// admin UI can import them as projects.
#[utoipa::path(
    get,
    path = "/api/admin/github/repos",
    tag = "admin/github",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "Importable GitHub repositories", body = Vec<github_repo::GithubRepo>),
        (status = 401, description = "Missing or invalid token"),
        (status = 502, description = "GitHub API unreachable or errored")
    )
)]
pub async fn list_github_repos(
    config: web::Data<Config>,
    _user: AdminUser,
) -> Result<HttpResponse, AppError> {
    let repos = github_repo::fetch_user_repos(&config)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("github repo list failed: {e}")))?;
    Ok(HttpResponse::Ok().json(repos))
}
