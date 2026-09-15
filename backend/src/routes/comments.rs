use actix_web::{web, HttpRequest, HttpResponse};
use uuid::Uuid;

use crate::auth::middleware::{AdminUser, AuthUser};
use crate::bans::BanStore;
use crate::client_ip::client_ip;
use crate::db::PgPool;
use crate::error::AppError;
use crate::models::{Comment, CreateCommentRequest};
use crate::rate_limit::CommentLimiter;

const MAX_COMMENT_LENGTH: usize = 2000;

async fn published_post_id(pool: &PgPool, id: i64) -> Result<i64, AppError> {
    let conn = pool.get().await?;
    let row = conn
        .query_opt(
            "SELECT id FROM posts WHERE id = $1 AND published = true",
            &[&id],
        )
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(row.get::<_, i64>("id"))
}

/// List every comment on a published post, oldest first.
#[utoipa::path(
    get,
    path = "/api/posts/{id}/comments",
    tag = "comments",
    params(("id" = i64, Path, description = "Post id")),
    responses(
        (status = 200, description = "Comments on the post", body = Vec<Comment>),
        (status = 404, description = "No published post with that id")
    )
)]
pub async fn list_comments(
    pool: web::Data<PgPool>,
    path: web::Path<i64>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let post_id = published_post_id(pool.get_ref(), id).await?;
    let conn = pool.get().await?;

    let rows = conn
        .query(
            "SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC",
            &[&post_id],
        )
        .await?;

    let comments: Vec<Comment> = rows
        .iter()
        .map(Comment::try_from)
        .collect::<Result<_, _>>()?;

    Ok(HttpResponse::Ok().json(comments))
}

/// Post a comment on a published post as the authenticated GitHub user.
#[utoipa::path(
    post,
    path = "/api/posts/{id}/comments",
    tag = "comments",
    security(("bearer_auth" = [])),
    params(("id" = i64, Path, description = "Post id")),
    request_body = CreateCommentRequest,
    responses(
        (status = 201, description = "Created", body = Comment),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid token"),
        (status = 403, description = "This account is blocked"),
        (status = 404, description = "No published post with that id"),
        (status = 429, description = "Rate limited")
    )
)]
pub async fn create_comment(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    bans: web::Data<BanStore>,
    limiter: web::Data<CommentLimiter>,
    user: AuthUser,
    path: web::Path<i64>,
    body: web::Json<CreateCommentRequest>,
) -> Result<HttpResponse, AppError> {
    if bans.is_user_blocked(&user.username) {
        return Err(AppError::Forbidden);
    }

    let ip = client_ip(&req);
    if !limiter.check(&format!("comment|{ip}")) {
        bans.record_violation(&ip).await;
        return Err(AppError::TooManyRequests);
    }

    let id = path.into_inner();
    let trimmed = body.body.trim();

    if trimmed.is_empty() {
        return Err(AppError::Validation("body must not be empty".into()));
    }
    if trimmed.chars().count() > MAX_COMMENT_LENGTH {
        return Err(AppError::Validation(format!(
            "body must not exceed {MAX_COMMENT_LENGTH} characters"
        )));
    }

    let post_id = published_post_id(pool.get_ref(), id).await?;
    let conn = pool.get().await?;

    let row = conn
        .query_one(
            "INSERT INTO comments (post_id, author_login, author_avatar_url, body)
             VALUES ($1, $2, $3, $4)
             RETURNING *",
            &[&post_id, &user.username, &user.avatar_url, &trimmed],
        )
        .await?;

    let comment = Comment::try_from(&row)?;
    Ok(HttpResponse::Created().json(comment))
}

/// Delete a comment (moderation).
#[utoipa::path(
    delete,
    path = "/api/admin/comments/{id}",
    tag = "comments",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path, description = "Comment id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid token"),
        (status = 404, description = "No comment with that id")
    )
)]
pub async fn delete_comment(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let conn = pool.get().await?;

    let affected = conn
        .execute("DELETE FROM comments WHERE id = $1", &[&id])
        .await?;

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}

/// Delete a comment as its author, or as an admin moderating the thread.
#[utoipa::path(
    delete,
    path = "/api/comments/{id}",
    tag = "comments",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path, description = "Comment id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid token"),
        (status = 403, description = "Not the comment's author and not an admin"),
        (status = 404, description = "No comment with that id")
    )
)]
pub async fn delete_own_comment(
    pool: web::Data<PgPool>,
    user: AuthUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let conn = pool.get().await?;

    let row = conn
        .query_opt("SELECT author_login FROM comments WHERE id = $1", &[&id])
        .await?
        .ok_or(AppError::NotFound)?;
    let author_login: String = row.get("author_login");

    // Ownership is decided here, never by the client: a signed-in user may
    // only delete their own comment, while an admin may delete any. Compared
    // case-insensitively because GitHub logins are unique case-insensitively
    // and both this stored login and the JWT subject come from the same
    // GitHub API field.
    if !user.is_admin && !author_login.eq_ignore_ascii_case(&user.username) {
        return Err(AppError::Forbidden);
    }

    conn.execute("DELETE FROM comments WHERE id = $1", &[&id])
        .await?;

    Ok(HttpResponse::NoContent().finish())
}
