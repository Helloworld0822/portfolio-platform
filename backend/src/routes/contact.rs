use actix_web::{web, HttpResponse};

use crate::auth::middleware::AdminUser;
use crate::db::PgPool;
use crate::error::AppError;
use crate::models::{ContactMessage, CreateContactRequest};

/// Store a message from the portfolio's contact form.
///
/// Messages are persisted only — no email is sent from here.
#[utoipa::path(
    post,
    path = "/api/contact",
    tag = "contact",
    request_body = CreateContactRequest,
    responses(
        (status = 201, description = "Stored", body = ContactMessage),
        (status = 400, description = "Validation error")
    )
)]
pub async fn create_contact_message(
    pool: web::Data<PgPool>,
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

    let conn = pool.get().await?;
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