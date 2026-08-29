use reqwest::Client;
use serde::Deserialize;

use crate::config::Config;

#[derive(Debug, Deserialize)]
struct GithubTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GithubUser {
    pub login: String,
    pub avatar_url: Option<String>,
}

fn redirect_uri(config: &Config) -> String {
    format!("{}/api/auth/github/callback", config.backend_base_url)
}

pub fn authorize_url(config: &Config, state: Option<&str>) -> String {
    let mut url = format!(
        "{}/login/oauth/authorize?client_id={}&redirect_uri={}&scope=read:user",
        config.github_oauth_base_url,
        config.github_client_id,
        urlencoding::encode(&redirect_uri(config)),
    );

    if let Some(state) = state {
        url.push_str("&state=");
        url.push_str(&urlencoding::encode(state));
    }

    url
}

pub async fn exchange_code(config: &Config, code: &str) -> anyhow::Result<String> {
    let client = Client::new();
    let redirect_uri = redirect_uri(config);

    let res: GithubTokenResponse = client
        .post(format!(
            "{}/login/oauth/access_token",
            config.github_oauth_base_url
        ))
        .header("Accept", "application/json")
        .form(&[
            ("client_id", config.github_client_id.as_str()),
            ("client_secret", config.github_client_secret.as_str()),
            ("code", code),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await?
        .json()
        .await?;

    if let Some(err) = res.error {
        anyhow::bail!("github token exchange failed: {}", err);
    }

    res.access_token
        .ok_or_else(|| anyhow::anyhow!("no access_token in github response"))
}

pub async fn fetch_user(config: &Config, access_token: &str) -> anyhow::Result<GithubUser> {
    let client = Client::new();
    let user: GithubUser = client
        .get(format!("{}/user", config.github_api_base_url))
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "portfolio-blog-api")
        .send()
        .await?
        .json()
        .await?;

    Ok(user)
}
