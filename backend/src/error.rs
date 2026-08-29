use actix_web::{HttpResponse, ResponseError};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,
    #[error("unauthorized")]
    Unauthorized,
    #[error("validation error: {0}")]
    Validation(String),
    #[error("internal error")]
    Internal(#[from] anyhow::Error),
}

impl ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        match self {
            AppError::NotFound => HttpResponse::NotFound().json(json!({ "error": "not_found" })),
            AppError::Unauthorized => {
                HttpResponse::Unauthorized().json(json!({ "error": "unauthorized" }))
            }
            AppError::Validation(message) => HttpResponse::BadRequest().json(json!({
                "error": "validation",
                "message": message
            })),
            AppError::Internal(err) => {
                tracing::error!(error = %err, "internal error");
                HttpResponse::InternalServerError().json(json!({ "error": "internal" }))
            }
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AppError::NotFound,
            other => AppError::Internal(other.into()),
        }
    }
}
