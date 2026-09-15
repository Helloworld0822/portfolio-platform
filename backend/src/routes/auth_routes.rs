use actix_web::{web, HttpResponse};
use serde::Deserialize;

use crate::auth::github;
use crate::auth::jwt::issue_jwt;
use crate::bans::BanStore;
use crate::config::Config;

#[derive(Debug, Deserialize)]
pub struct LoginQuery {
    pub state: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
}

/// Redirect to GitHub's OAuth consent screen.
#[utoipa::path(
    get,
    path = "/api/auth/github/login",
    tag = "auth",
    params(("state" = Option<String>, Query, description = "Path to return to after login")),
    responses((status = 302, description = "Redirect to GitHub authorize URL"))
)]
pub async fn github_login(
    config: web::Data<Config>,
    query: web::Query<LoginQuery>,
) -> HttpResponse {
    HttpResponse::Found()
        .append_header((
            "Location",
            github::authorize_url(&config, query.state.as_deref()),
        ))
        .finish()
}

/// GitHub OAuth callback. Issues a JWT for any authenticated GitHub user and
/// redirects back to the frontend: to `/admin` for the configured admin, or
/// to the `state` path (defaulting to `/`) for everyone else. Redirects to
/// `/?error=unauthorized` if the exchange or user lookup fails.
#[utoipa::path(
    get,
    path = "/api/auth/github/callback",
    tag = "auth",
    params(
        ("code" = Option<String>, Query, description = "OAuth authorization code"),
        ("state" = Option<String>, Query, description = "Path to return to after login")
    ),
    responses((status = 302, description = "Redirect to the frontend with a token or an error"))
)]
pub async fn github_callback(
    config: web::Data<Config>,
    bans: web::Data<BanStore>,
    query: web::Query<CallbackQuery>,
) -> HttpResponse {
    let unauthorized_redirect = || {
        HttpResponse::Found()
            .append_header((
                "Location",
                format!(
                    "{}/?error=unauthorized",
                    config.frontend_url.trim_end_matches('/')
                ),
            ))
            .finish()
    };

    let blocked_redirect = || {
        HttpResponse::Found()
            .append_header((
                "Location",
                format!(
                    "{}/?error=blocked",
                    config.frontend_url.trim_end_matches('/')
                ),
            ))
            .finish()
    };

    let Some(code) = &query.code else {
        return unauthorized_redirect();
    };

    let access_token = match github::exchange_code(&config, code).await {
        Ok(token) => token,
        Err(err) => {
            tracing::warn!(error = %err, "github code exchange failed");
            return unauthorized_redirect();
        }
    };

    let user = match github::fetch_user(&config, &access_token).await {
        Ok(user) => user,
        Err(err) => {
            tracing::warn!(error = %err, "github user fetch failed");
            return unauthorized_redirect();
        }
    };

    if bans.is_user_blocked(&user.login) {
        return blocked_redirect();
    }

    let is_admin = user.login == config.admin_github_username;
    let role = if is_admin { "admin" } else { "user" };

    match issue_jwt(
        &user.login,
        role,
        user.avatar_url.clone(),
        &config.jwt_secret,
    ) {
        Ok(token) => {
            let frontend_url = config.frontend_url.trim_end_matches('/');
            let path = if is_admin {
                "/admin".to_string()
            } else {
                safe_return_path(query.state.as_deref())
            };
            // Fragments are never sent to the server, so the token cannot end up
            // in nginx/Cloudflare access logs or in a Referer header the way a
            // query parameter would.
            HttpResponse::Found()
                .append_header(("Location", format!("{frontend_url}{path}#token={token}")))
                .finish()
        }
        Err(err) => {
            tracing::error!(error = %err, "jwt issuance failed");
            unauthorized_redirect()
        }
    }
}

/// Only a same-origin path may be echoed back after login. Absolute URLs,
/// protocol-relative `//host`, backslashes and an embedded `@` would all turn
/// the frontend origin into URL userinfo and forward the freshly issued token
/// to another host, so anything but a plain path collapses to "/".
fn safe_return_path(state: Option<&str>) -> String {
    const FALLBACK: &str = "/";

    let Some(state) = state else {
        return FALLBACK.to_string();
    };

    let is_plain_path = state.starts_with('/')
        && !state.starts_with("//")
        && state
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '_' | '.' | '~'));

    if is_plain_path {
        state.to_string()
    } else {
        FALLBACK.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::safe_return_path;

    #[test]
    fn keeps_plain_relative_paths() {
        assert_eq!(safe_return_path(Some("/")), "/");
        assert_eq!(safe_return_path(Some("/blog/12")), "/blog/12");
        assert_eq!(safe_return_path(None), "/");
    }

    #[test]
    fn refuses_paths_that_would_leave_the_frontend_origin() {
        assert_eq!(safe_return_path(Some("//evil.example")), "/");
        assert_eq!(safe_return_path(Some("@evil.example")), "/");
        assert_eq!(safe_return_path(Some("/@evil.example")), "/");
        assert_eq!(safe_return_path(Some("https://evil.example")), "/");
        assert_eq!(safe_return_path(Some("/\\evil.example")), "/");
        assert_eq!(safe_return_path(Some("/path?next=//evil.example")), "/");
        assert_eq!(safe_return_path(Some("")), "/");
    }
}
