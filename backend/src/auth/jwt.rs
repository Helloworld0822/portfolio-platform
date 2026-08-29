use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

const TOKEN_TTL_DAYS: i64 = 7;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub role: String,
    pub avatar_url: Option<String>,
    pub exp: usize,
}

pub fn issue_jwt(
    username: &str,
    role: &str,
    avatar_url: Option<String>,
    secret: &str,
) -> anyhow::Result<String> {
    issue_jwt_with_ttl(
        username,
        role,
        avatar_url,
        secret,
        Duration::days(TOKEN_TTL_DAYS),
    )
}

pub fn issue_jwt_with_ttl(
    username: &str,
    role: &str,
    avatar_url: Option<String>,
    secret: &str,
    ttl: Duration,
) -> anyhow::Result<String> {
    let exp = (Utc::now() + ttl).timestamp() as usize;
    let claims = Claims {
        sub: username.to_string(),
        role: role.to_string(),
        avatar_url,
        exp,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(token)
}

pub fn validate_jwt(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issued_token_validates_and_round_trips_username() {
        let token = issue_jwt("Helloworld0822", "admin", None, "test-secret").unwrap();
        let claims = validate_jwt(&token, "test-secret").unwrap();
        assert_eq!(claims.sub, "Helloworld0822");
        assert_eq!(claims.role, "admin");
    }

    #[test]
    fn expired_token_is_rejected() {
        let token = issue_jwt_with_ttl(
            "Helloworld0822",
            "admin",
            None,
            "test-secret",
            Duration::seconds(-10),
        )
        .unwrap();
        assert!(validate_jwt(&token, "test-secret").is_err());
    }

    #[test]
    fn wrong_secret_is_rejected() {
        let token = issue_jwt("Helloworld0822", "admin", None, "test-secret").unwrap();
        assert!(validate_jwt(&token, "different-secret").is_err());
    }
}
