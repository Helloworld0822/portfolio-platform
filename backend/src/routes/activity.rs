use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    handle: String,
    #[serde(deserialize_with = "deserialize_tier")]
    tier: u8,
    rating: u32,
    solved_count: u32,
}

struct Cache {
    next_refresh: Instant,
    profile: Option<Profile>,
}

static CACHE: Mutex<Option<Cache>> = Mutex::const_new(None);

const PROFILE_URL: &str = "https://solved.ac/api/v4/users/a100822";

fn deserialize_tier<'de, D: serde::Deserializer<'de>>(input: D) -> Result<u8, D::Error> {
    Ok(Option::<u8>::deserialize(input)?.unwrap_or(0))
}

async fn fetch_profile(url: &str, id: &str, secret: &str) -> Option<Profile> {
    if id.is_empty() || secret.is_empty() {
        return None;
    }
    let profile: Profile = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .ok()?
        .get(url)
        .header("x-client-id", id)
        .header("x-client-secret", secret)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .await
        .ok()?;
    (profile.handle == "a100822" && profile.tier <= 31).then_some(profile)
}

pub async fn solved_profile() -> HttpResponse {
    let mut guard = CACHE.lock().await;
    let cache = guard.get_or_insert_with(|| Cache {
        next_refresh: Instant::now(),
        profile: None,
    });
    if Instant::now() >= cache.next_refresh {
        let id = std::env::var("SOLVED_CLIENT_ID").unwrap_or_default();
        let secret = std::env::var("SOLVED_CLIENT_SECRET").unwrap_or_default();
        let delay = if let Some(profile) = fetch_profile(PROFILE_URL, &id, &secret).await {
            cache.profile = Some(profile);
            3600
        } else {
            60
        };
        cache.next_refresh = Instant::now() + Duration::from_secs(delay);
    }
    match &cache.profile {
        Some(profile) => HttpResponse::Ok().json(profile),
        None => HttpResponse::ServiceUnavailable().finish(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{matchers::method, Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn accepts_only_metrics_for_the_portfolio_owner() {
        for (handle, tier, expected) in [
            ("a100822", 17, true),
            ("other", 17, false),
            ("a100822", 32, false),
        ] {
            let server = MockServer::start().await;
            let body = serde_json::json!({"handle": handle, "tier": tier, "rating": 1550, "solvedCount": 81});
            Mock::given(method("GET"))
                .and(wiremock::matchers::header("x-client-id", "id"))
                .and(wiremock::matchers::header("x-client-secret", "secret"))
                .respond_with(ResponseTemplate::new(200).set_body_json(body))
                .mount(&server)
                .await;
            assert_eq!(
                fetch_profile(&server.uri(), "id", "secret").await.is_some(),
                expected
            );
        }
    }
}
