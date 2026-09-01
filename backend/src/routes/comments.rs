use actix_web::{web, HttpResponse};
use uuid::Uuid;

use crate::auth::middleware::{AdminUser, AuthUser};
use crate::db::PgPool;
use crate::error::AppError;
use crate::models::{Comment, CreateCommentRequest};

const MAX_COMMENT_LENGTH: usize = 2000;

async fn published_post_id(pool: &PgPool, slug: &str) -> Result<Uuid, AppError> {
    let conn = pool.get().await?;
    let row = conn
        .query_opt(
            "SELECT id FROM posts WHERE slug = $1 AND published = true",
            &[&slug],
        )
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(row.get::<_, Uuid>("id"))
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
