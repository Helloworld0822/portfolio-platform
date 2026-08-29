#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub admin_github_username: String,
    pub frontend_url: String,
    pub backend_base_url: String,
    pub cors_allowed_origins: Vec<String>,
    pub host: String,
    pub port: u16,
    pub github_oauth_base_url: String,
    pub github_api_base_url: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            database_url: std::env::var("DATABASE_URL")?,
            jwt_secret: std::env::var("JWT_SECRET")?,
            github_client_id: std::env::var("GITHUB_CLIENT_ID")?,
            github_client_secret: std::env::var("GITHUB_CLIENT_SECRET")?,
            admin_github_username: std::env::var("ADMIN_GITHUB_USERNAME")?,
            frontend_url: std::env::var("FRONTEND_URL")?,
            backend_base_url: std::env::var("BACKEND_BASE_URL")?,
            cors_allowed_origins: std::env::var("CORS_ALLOWED_ORIGINS")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()?,
            github_oauth_base_url: std::env::var("GITHUB_OAUTH_BASE_URL")
                .unwrap_or_else(|_| "https://github.com".to_string()),
            github_api_base_url: std::env::var("GITHUB_API_BASE_URL")
                .unwrap_or_else(|_| "https://api.github.com".to_string()),
        })
    }
}
