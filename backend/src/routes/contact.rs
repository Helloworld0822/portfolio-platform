use actix_web::{web, HttpRequest, HttpResponse};
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::db::PgPool;
use crate::error::AppError;
use crate::models::{ContactMessage, CreateContactRequest};
use crate::rate_limit::RateLimiter;

/// Store a message from the portfolio's contact form.
///
/// Messages are persisted only — no email is sent from here. Requests are
/// rate-limited per IP+email and rejected when an identical message was
/// submitted in the last 24h, to cut down on form spam and double-submits.
#[utoipa::path(
    post,
    path = "/api/contact",
    tag = "contact",
    request_body = CreateContactRequest,
    responses(
        (status = 201, description = "Stored", body = ContactMessage),
        (status = 400, description = "Validation error or duplicate message within 24h"),
        (status = 429, description = "Rate limited")
    )
)]
pub async fn create_contact_message(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    limiter: web::Data<RateLimiter>,
    body: web::Json<CreateContactRequest>,
) -> Result<HttpResponse, AppError> {
    let name = body.name.trim();
    let email = body.email.trim();
    let message = body.message.trim();

    if name.is_empty() {
        return Err(AppError::Validation("name must not be empty".into()));
    }
    if message.is_empty() {
        return Err(AppError::Validation("message must not be empty".into()));
    }
    if !is_plausible_email(email) {
        return Err(AppError::Validation("email is not a valid address".into()));
    }

    let key = format!("{}|{}", client_ip(&req), email.to_lowercase());
    if !limiter.check(&key) {
        return Err(AppError::TooManyRequests);
    }

    let conn = pool.get().await?;
    let dup = conn
        .query_opt(
            "SELECT 1 FROM contact_messages
             WHERE lower(email) = lower($1) AND message = $2
               AND created_at > now() - interval '24 hours'
             LIMIT 1",
            &[&email, &message],
        )
        .await?;
    if dup.is_some() {
        return Err(AppError::Validation(
            "이미 동일한 내용의 문의가 접수되었습니다. 잠시 후 다시 시도해주세요.".into(),
        ));
    }

    let row = conn
        .query_one(
            "INSERT INTO contact_messages (name, email, message)
             VALUES ($1, $2, $3)
             RETURNING *",
            &[&name, &email, &message],
        )
        .await?;

    let stored = ContactMessage::try_from(&row)?;
    Ok(HttpResponse::Created().json(stored))
}

/// List every stored contact message, newest first.
#[utoipa::path(
    get,
    path = "/api/admin/contact",
    tag = "admin/contact",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "All contact messages", body = Vec<ContactMessage>),
        (status = 401, description = "Missing or invalid token")
    )
)]
pub async fn list_contact_messages(
    pool: web::Data<PgPool>,
    _user: AdminUser,
) -> Result<HttpResponse, AppError> {
    let conn = pool.get().await?;
    let rows = conn
        .query(
            "SELECT * FROM contact_messages ORDER BY created_at DESC",
            &[],
        )
        .await?;

    let messages: Vec<ContactMessage> = rows
        .iter()
        .map(ContactMessage::try_from)
        .collect::<Result<_, _>>()?;

    Ok(HttpResponse::Ok().json(messages))
}

/// Delete a single contact message.
#[utoipa::path(
    delete,
    path = "/api/admin/contact/{id}",
    tag = "admin/contact",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path, description = "Contact message id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid token"),
        (status = 404, description = "No message with that id")
    )
)]
pub async fn delete_contact_message(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let conn = pool.get().await?;

    let affected = conn
        .execute("DELETE FROM contact_messages WHERE id = $1", &[&id])
        .await?;

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}

/// Drop duplicate contact messages, keeping the earliest copy of each
/// (normalized email, message) pair.
#[utoipa::path(
    post,
    path = "/api/admin/contact/dedupe",
    tag = "admin/contact",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "Removed count", body = DedupResult),
        (status = 401, description = "Missing or invalid token")
    )
)]
pub async fn dedupe_contact_messages(
    pool: web::Data<PgPool>,
    _user: AdminUser,
) -> Result<HttpResponse, AppError> {
    let conn = pool.get().await?;
    let affected = conn
        .execute(
            "DELETE FROM contact_messages
             WHERE id NOT IN (
                 SELECT DISTINCT ON (lower(email), message) id
                 FROM contact_messages
                 ORDER BY lower(email), message, created_at ASC, id ASC
             )",
            &[],
        )
        .await?;

    Ok(HttpResponse::Ok().json(DedupResult {
        removed: affected as i64,
    }))
}

#[derive(utoipa::ToSchema, serde::Serialize)]
pub struct DedupResult {
    pub removed: i64,
}

/// The proxy in front of this stack sets X-Real-IP, falling back to the direct
/// peer address for local runs.
fn client_ip(req: &HttpRequest) -> String {
    if let Some(ip) = req.headers().get("x-real-ip").and_then(|v| v.to_str().ok()) {
        return ip.to_string();
    }
    req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Deliberately loose check: one `@` with something before it, and a `.`
/// somewhere after it. Anything stricter rejects valid addresses.
fn is_plausible_email(email: &str) -> bool {
    if email.contains(char::is_whitespace) {
        return false;
    }

    let mut parts = email.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };

    !local.is_empty()
        && domain.len() >= 3
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
}

#[cfg(test)]
mod tests {
    use super::is_plausible_email;

    #[test]
    fn accepts_ordinary_addresses() {
        assert!(is_plausible_email("a100822@naver.com"));
        assert!(is_plausible_email("first.last+tag@sub.example.co.kr"));
    }

    #[test]
    fn rejects_malformed_addresses() {
        assert!(!is_plausible_email(""));
        assert!(!is_plausible_email("no-at-sign.com"));
        assert!(!is_plausible_email("@example.com"));
        assert!(!is_plausible_email("user@nodot"));
        assert!(!is_plausible_email("user@.com"));
        assert!(!is_plausible_email("user@example."));
        assert!(!is_plausible_email("two@at@example.com"));
        assert!(!is_plausible_email("has space@example.com"));
    }
}
