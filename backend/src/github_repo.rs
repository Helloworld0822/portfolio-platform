use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::config::Config;

#[derive(Debug, Deserialize)]
struct RepoInfo {
    private: bool,
}

#[derive(Debug, Deserialize)]
struct RepoOwner {
    login: String,
}

#[derive(Debug, Deserialize)]
struct RepoItem {
    name: String,
    full_name: String,
    html_url: String,
    description: Option<String>,
    language: Option<String>,
    private: bool,
    owner: RepoOwner,
}

/// A GitHub repository as returned to the admin project importer.
#[derive(Debug, Serialize, ToSchema)]
pub struct GithubRepo {
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub description: Option<String>,
    pub language: Option<String>,
    pub is_private: bool,
    /// Owner login. Frontends group repos under this name so that personal and
    /// organization-owned repositories can be presented as separate groups.
    pub owner: String,
}

#[derive(Debug, Default)]
pub struct RepoMeta {
    /// language -> bytes of code, as returned by the GitHub languages API.
    pub languages: HashMap<String, i64>,
    pub is_private: bool,
}

/// Extract (owner, repo) from a github.com URL. Returns None for non-GitHub
/// URLs so callers can skip the network call.
pub fn repo_path(url: &str) -> Option<(String, String)> {
    // "https://github.com/owner/repo[/...]" -> ["https:", "", "github.com", ...]
    let mut parts = url.trim_end_matches('/').split('/');
    let _ = parts.next()?; // scheme
    let _ = parts.next()?; // empty after "//"
    let host = parts.next()?;
    if !host.eq_ignore_ascii_case("github.com") {
        return None;
    }
    let owner = parts.next()?;
    let repo = parts.next()?.trim_end_matches(".git");
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner.to_string(), repo.to_string()))
}

/// A reqwest client preconfigured with the GitHub-mandated User-Agent and the
/// optional bearer token, shared by every GitHub API call in this module.
fn github_client(config: &Config) -> reqwest::Client {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_static("portfolio-platform-api"),
    );
    if let Some(token) = &config.github_token {
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {token}"))
                .expect("a configured token is always a valid header value"),
        );
    }
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .expect("reqwest client build should not fail with default settings")
}

/// Best-effort fetch of a GitHub repository's language breakdown and privacy.
/// Returns None when the URL is not a GitHub repo or the API call fails, so
/// callers can keep stored defaults instead of failing the request.
pub async fn fetch_repo_meta(config: &Config, url: &str) -> Option<RepoMeta> {
    let (owner, repo) = repo_path(url)?;

    let client = github_client(config);
    let languages_url = format!(
        "{}/repos/{}/{}/languages",
        config.github_api_base_url, owner, repo
    );
    let repo_url = format!("{}/repos/{}/{}", config.github_api_base_url, owner, repo);

    let (langs_res, info_res) = tokio::join!(
        client
            .get(&languages_url)
            .timeout(Duration::from_secs(5))
            .send(),
        client.get(&repo_url).timeout(Duration::from_secs(5)).send(),
    );
    let languages = langs_res
        .ok()?
        .error_for_status()
        .ok()?
        .json::<HashMap<String, i64>>()
        .await
        .ok()?;
    let is_private = info_res
        .ok()?
        .error_for_status()
        .ok()?
        .json::<RepoInfo>()
        .await
        .ok()?
        .private;

    Some(RepoMeta {
        languages,
        is_private,
    })
}

/// List the repositories the configured GitHub token (or the admin's public
/// profile, when no token is set) can see. Used by the admin UI to import
/// projects. Fails the request when GitHub is unreachable, since the caller
/// explicitly asked for the list.
pub async fn fetch_user_repos(config: &Config) -> anyhow::Result<Vec<GithubRepo>> {
    let endpoint = if config.github_token.is_some() {
        // Token present: list every repo the token can read, including any the
        // admin belongs to as a member (org-owned repos included).
        format!("{}/user/repos", config.github_api_base_url)
    } else {
        // No token: public profile repos only. Organization membership cannot
        // be resolved anonymously.
        format!(
            "{}/users/{}/repos",
            config.github_api_base_url, config.admin_github_username
        )
    };

    let client = github_client(config);

    let mut repos = Vec::new();
    for page in 1..=3 {
        let url = format!("{endpoint}?per_page=100&page={page}");
        let res = client
            .get(&url)
            .timeout(Duration::from_secs(10))
            .send()
            .await?
            .error_for_status()?;
        let page_repos: Vec<RepoItem> = res.json().await?;
        if page_repos.is_empty() {
            break;
        }
        repos.extend(page_repos.into_iter().map(|repo| GithubRepo {
            name: repo.name,
            full_name: repo.full_name,
            html_url: repo.html_url,
            description: repo.description,
            language: repo.language,
            is_private: repo.private,
            owner: repo.owner.login,
        }));
    }

    // Deterministic order for the admin picker: group by owner, then name.
    repos.sort_by(|a, b| a.owner.cmp(&b.owner).then(a.name.cmp(&b.name)));
    Ok(repos)
}

#[cfg(test)]
mod tests {
    use super::repo_path;

    #[test]
    fn parses_github_repo_urls() {
        assert_eq!(
            repo_path("https://github.com/Helloworld0822/AutoForge"),
            Some(("Helloworld0822".into(), "AutoForge".into()))
        );
        assert_eq!(
            repo_path("https://github.com/org/repo/"),
            Some(("org".into(), "repo".into()))
        );
        assert_eq!(
            repo_path("https://github.com/org/repo.git"),
            Some(("org".into(), "repo".into()))
        );
    }

    #[test]
    fn rejects_non_github_urls() {
        assert!(repo_path("https://gitlab.com/org/repo").is_none());
        assert!(repo_path("https://example.com/x").is_none());
        assert!(repo_path("").is_none());
    }
}
