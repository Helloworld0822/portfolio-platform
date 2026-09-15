use actix_web::{web, HttpResponse};
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::json;

use crate::auth::middleware::AdminUser;
use crate::bans::{BanStore, IpBan, UserBlock};
use crate::client_ip::is_bannable;
use crate::config::Config;
use crate::error::AppError;

/// A manual ban may not outlive a year; automatic bans are an hour.
const MAX_BAN_HOURS: i64 = 24 * 365;
const MAX_LOGIN_LENGTH: usize = 39;

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct BanIpRequest {
    pub ip: String,
    pub reason: Option<String>,
    /// Hours until the ban lifts; omit for a ban that lasts until removed.
    pub duration_hours: Option<i64>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct BlockUserRequest {
    pub login: String,
    pub reason: Option<String>,
}

#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
pub struct BanList {
    pub ips: Vec<IpBan>,
    pub users: Vec<UserBlock>,
}

/// List every active IP ban and blocked GitHub login.
#[utoipa::path(
    get,
    path = "/api/admin/bans",
    tag = "admin/bans",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "Current IP bans and blocked users", body = BanList),
        (status = 401, description = "Missing or invalid admin token")
    )
)]
pub async fn list_bans(
    store: web::Data<BanStore>,
    _user: AdminUser,
) -> Result<HttpResponse, AppError> {
    let list = BanList {
        ips: store.list_ip_bans().await?,
        users: store.list_blocked_users().await?,
    };

    Ok(HttpResponse::Ok().json(list))
}

/// Ban an IP address, blocking every request from it until the ban expires or
/// is removed.
#[utoipa::path(
    post,
    path = "/api/admin/bans/ips",
    tag = "admin/bans",
    security(("bearer_auth" = [])),
    request_body = BanIpRequest,
    responses(
        (status = 201, description = "Banned"),
        (status = 400, description = "Not a public IP address"),
        (status = 401, description = "Missing or invalid admin token")
    )
)]
pub async fn ban_ip(
    store: web::Data<BanStore>,
    _user: AdminUser,
    body: web::Json<BanIpRequest>,
) -> Result<HttpResponse, AppError> {
    let ip = body.ip.trim();
    if !is_bannable(ip) {
        return Err(AppError::Validation(
            "a public IPv4/IPv6 address is required; private and loopback ranges cannot be banned"
                .into(),
        ));
    }

    let expires_at = body
        .duration_hours
        .map(|hours| Utc::now() + Duration::hours(hours.clamp(1, MAX_BAN_HOURS)));
    store.ban_ip(ip, body.reason.as_deref(), expires_at).await?;

    Ok(HttpResponse::Created().json(json!({ "ip": ip, "expires_at": expires_at })))
}

/// Lift an IP ban.
#[utoipa::path(
    delete,
    path = "/api/admin/bans/ips/{ip}",
    tag = "admin/bans",
    security(("bearer_auth" = [])),
    params(("ip" = String, Path, description = "Banned IP address")),
    responses(
        (status = 204, description = "Unbanned"),
        (status = 401, description = "Missing or invalid admin token"),
        (status = 404, description = "No ban for that address")
    )
)]
pub async fn unban_ip(
    store: web::Data<BanStore>,
    _user: AdminUser,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let ip = path.into_inner();
    if !store.unban_ip(&ip).await? {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}

/// Block a GitHub login: the account can no longer log in or post comments.
#[utoipa::path(
    post,
    path = "/api/admin/bans/users",
    tag = "admin/bans",
    security(("bearer_auth" = [])),
    request_body = BlockUserRequest,
    responses(
        (status = 201, description = "Blocked"),
        (status = 400, description = "Invalid login, or it is the configured admin"),
        (status = 401, description = "Missing or invalid admin token")
    )
)]
pub async fn block_user(
    store: web::Data<BanStore>,
    config: web::Data<Config>,
    _user: AdminUser,
    body: web::Json<BlockUserRequest>,
) -> Result<HttpResponse, AppError> {
    let login = body.login.trim();
    if login.is_empty() || login.chars().count() > MAX_LOGIN_LENGTH {
        return Err(AppError::Validation(format!(
            "login must be 1-{MAX_LOGIN_LENGTH} characters"
        )));
    }
    if !login.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(AppError::Validation(
            "login may only contain letters, digits and hyphens".into(),
        ));
    }
    // Blocking the owner's own account would lock the dashboard out for good,
    // so it is refused here rather than left to be discovered later.
    if login.eq_ignore_ascii_case(&config.admin_github_username) {
        return Err(AppError::Validation(
            "the configured admin account cannot be blocked".into(),
        ));
    }

    store.block_user(login, body.reason.as_deref()).await?;
    Ok(HttpResponse::Created().json(json!({ "login": login })))
}

/// Unblock a GitHub login.
#[utoipa::path(
    delete,
    path = "/api/admin/bans/users/{login}",
    tag = "admin/bans",
    security(("bearer_auth" = [])),
    params(("login" = String, Path, description = "Blocked GitHub login")),
    responses(
        (status = 204, description = "Unblocked"),
        (status = 401, description = "Missing or invalid admin token"),
        (status = 404, description = "No block for that login")
    )
)]
pub async fn unblock_user(
    store: web::Data<BanStore>,
    _user: AdminUser,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let login = path.into_inner();
    if !store.unblock_user(&login).await? {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}
