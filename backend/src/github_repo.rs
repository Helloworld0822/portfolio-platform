use std::collections::HashMap;
use std::time::Duration;

use serde::Deserialize;

use crate::config::Config;

#[derive(Debug, Deserialize)]
struct RepoInfo {
    private: bool,
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

/// Best-effort fetch of a GitHub repository's language breakdown and privacy.
/// Returns None when the URL is not a GitHub repo or the API call fails, so
/// callers can keep stored defaults instead of failing the request.
pub async fn fetch_repo_meta(config: &Config, url: &str) -> Option<RepoMeta> {
    let (owner, repo) = repo_path(url)?;

    let client = reqwest::Client::new();
    let languages_url = format!(
        "{}/repos/{}/{}/languages",
        config.github_api_base_url, owner, repo
    );
    let repo_url = format!("{}/repos/{}/{}", config.github_api_base_url, owner, repo);

    let mut langs_req = client
        .get(&languages_url)
        .header(reqwest::header::USER_AGENT, "portfolio-platform-api")
        .timeout(Duration::from_secs(5));
    let mut info_req = client
        .get(&repo_url)
        .header(reqwest::header::USER_AGENT, "portfolio-platform-api")
        .timeout(Duration::from_secs(5));
    if let Some(token) = &config.github_token {
        langs_req = langs_req.bearer_auth(token);
        info_req = info_req.bearer_auth(token);
    }

    let (langs_res, info_res) = tokio::join!(langs_req.send(), info_req.send());
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
