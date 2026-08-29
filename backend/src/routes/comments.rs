use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::{AdminUser, AuthUser};
use crate::error::AppError;
use crate::models::{Comment, CreateCommentRequest};

const MAX_COMMENT_LENGTH: usize = 2000;

async fn published_post_id(pool: &PgPool, slug: &str) -> Result<Uuid, AppError> {
    let row: (Uuid,) =
        sqlx::query_as("SELECT id FROM posts WHERE slug = $1 AND published = true")
            .bind(slug)
            .fetch_optional(pool)
            .await?
            .ok_or(AppError::NotFound)?;

    Ok(row.0)
}

/// List every comment on a published post, oldest first.
#[utoipa::path(
    get,
    path = "/api/posts/{slug}/comments",
    tag = "comments",
    params(("slug" = String, Path, description = "Post slug")),
    responses(
        (status = 200, description = "Comments on the post", body = Vec<Comment>),
        (status = 404, description = "No published post with that slug")
    )
)]
pub async fn list_comments(
    pool: web::Data<PgPool>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let slug = path.into_inner();
    let post_id = published_post_id(pool.get_ref(), &slug).await?;

    let comments: Vec<Comment> = sqlx::query_as(
        "SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC",
    )
    .bind(post_id)
    .fetch_all(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(comments))
}

/// Post a comment on a published post as the authenticated GitHub user.
#[utoipa::path(
    post,
    path = "/api/posts/{slug}/comments",
    tag = "comments",
    security(("bearer_auth" = [])),
    params(("slug" = String, Path, description = "Post slug")),
    request_body = CreateCommentRequest,
    responses(
        (status = 201, description = "Created", body = Comment),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid token"),
        (status = 404, description = "No published post with that slug")
    )
)]
pub async fn create_comment(
    pool: web::Data<PgPool>,
    user: AuthUser,
    path: web::Path<String>,
    body: web::Json<CreateCommentRequest>,
) -> Result<HttpResponse, AppError> {
    let slug = path.into_inner();
    let trimmed = body.body.trim();

    if trimmed.is_empty() {
        return Err(AppError::Validation("body must not be empty".into()));
    }
    if trimmed.chars().count() > MAX_COMMENT_LENGTH {
        return Err(AppError::Validation(format!(
            "body must not exceed {MAX_COMMENT_LENGTH} characters"
        )));
    }

    let post_id = published_post_id(pool.get_ref(), &slug).await?;

    let comment: Comment = sqlx::query_as(
        "INSERT INTO comments (post_id, author_login, author_avatar_url, body)
         VALUES ($1, $2, $3, $4)
         RETURNING *",
    )
    .bind(post_id)
    .bind(&user.username)
    .bind(&user.avatar_url)
    .bind(trimmed)
    .fetch_one(pool.get_ref())
    .await?;

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

    let result = sqlx::query("DELETE FROM comments WHERE id = $1")
        .bind(id)
        .execute(pool.get_ref())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}
