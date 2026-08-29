#![allow(dead_code)]

use portfolio_blog_api::auth::jwt::issue_jwt;
use portfolio_blog_api::config::Config;

pub const ADMIN_USERNAME: &str = "Helloworld0822";
pub const JWT_SECRET: &str = "test-secret";

/// A config with no reachable GitHub host. Port 0 is never listening, so any
/// accidental outbound call fails fast instead of hitting the real API.
pub fn test_config() -> Config {
    Config {
        database_url: "postgres://unused/unused".to_string(),
        jwt_secret: JWT_SECRET.to_string(),
        github_client_id: "test-client-id".to_string(),
        github_client_secret: "test-client-secret".to_string(),
        admin_github_username: ADMIN_USERNAME.to_string(),
        frontend_url: "http://localhost:5173/".to_string(),
        backend_base_url: "http://localhost:8080".to_string(),
        cors_allowed_origins: vec!["http://localhost:5173".to_string()],
        host: "127.0.0.1".to_string(),
        port: 8080,
        github_oauth_base_url: "http://localhost:0".to_string(),
        github_api_base_url: "http://localhost:0".to_string(),
    }
}

pub fn admin_token() -> String {
    issue_jwt(ADMIN_USERNAME, "admin", None, JWT_SECRET)
        .expect("issuing a test token should succeed")
}

pub fn auth_header() -> (&'static str, String) {
    ("Authorization", format!("Bearer {}", admin_token()))
}

pub fn user_token(username: &str) -> String {
    issue_jwt(username, "user", None, JWT_SECRET).expect("issuing a test token should succeed")
}

pub fn user_auth_header(username: &str) -> (&'static str, String) {
    ("Authorization", format!("Bearer {}", user_token(username)))
}
