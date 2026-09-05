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
    #[error("too many requests")]
    TooManyRequests,
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
            AppError::TooManyRequests => HttpResponse::TooManyRequests().json(json!({
                "error": "too_many_requests"
            })),
            AppError::Internal(err) => {
                tracing::error!(error = %err, "internal error");
                HttpResponse::InternalServerError().json(json!({ "error": "internal" }))
            }
        }
    }
}

impl From<tokio_postgres::Error> for AppError {
    fn from(err: tokio_postgres::Error) -> Self {
        AppError::Internal(err.into())
    }
}

impl From<bb8::RunError<tokio_postgres::Error>> for AppError {
    fn from(err: bb8::RunError<tokio_postgres::Error>) -> Self {
        AppError::Internal(err.into())
    }
}
