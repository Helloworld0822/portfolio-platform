use actix_web::{dev::Payload, web, FromRequest, HttpRequest};
use futures_util::future::{ready, Ready};

use crate::auth::jwt::{validate_jwt, Claims};
use crate::config::Config;
use crate::error::AppError;

fn extract_claims(req: &HttpRequest) -> Result<Claims, AppError> {
    let config = req
        .app_data::<web::Data<Config>>()
        .ok_or(AppError::Unauthorized)?;

    let header = req
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or(AppError::Unauthorized)?;

    let token = header.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?;

    validate_jwt(token, &config.jwt_secret).map_err(|_| AppError::Unauthorized)
}

pub struct AdminUser {
    pub username: String,
}

impl FromRequest for AdminUser {
    type Error = AppError;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let result = extract_claims(req).and_then(|claims| {
            if claims.role != "admin" {
                return Err(AppError::Unauthorized);
            }

            Ok(AdminUser {
                username: claims.sub,
            })
        });

        ready(result)
    }
}

pub struct AuthUser {
    pub username: String,
    pub avatar_url: Option<String>,
}

impl FromRequest for AuthUser {
    type Error = AppError;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let result = extract_claims(req).map(|claims| AuthUser {
            username: claims.sub,
            avatar_url: claims.avatar_url,
        });

        ready(result)
    }
}
