use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::{CreatePostRequest, Post, PostSummary, UpdatePostRequest};
use crate::slug::unique_slug;

/// List every published post, newest first.
#[utoipa::path(
    get,
    path = "/api/posts",
    tag = "posts",
    responses((status = 200, description = "Published posts", body = Vec<PostSummary>))
)]
pub async fn list_posts(pool: web::Data<PgPool>) -> Result<HttpResponse, AppError> {
    let posts: Vec<PostSummary> = sqlx::query_as(
        "SELECT id, slug, title, excerpt, created_at FROM posts
         WHERE published = true
         ORDER BY created_at DESC",
    )
    .fetch_all(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(posts))
}

/// Fetch one published post by its slug.
#[utoipa::path(
    get,
    path = "/api/posts/{slug}",
    tag = "posts",
    params(("slug" = String, Path, description = "Post slug")),
    responses(
        (status = 200, description = "The post", body = Post),
        (status = 404, description = "No published post with that slug")
    )
)]
pub async fn get_post(
    pool: web::Data<PgPool>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let slug = path.into_inner();

    let post: Post = sqlx::query_as("SELECT * FROM posts WHERE slug = $1 AND published = true")
        .bind(&slug)
        .fetch_optional(pool.get_ref())
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(HttpResponse::Ok().json(post))
}

/// List every post, drafts included.
#[utoipa::path(
    get,
    path = "/api/admin/posts",
    tag = "admin/posts",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "All posts", body = Vec<PostSummary>),
        (status = 401, description = "Missing or invalid token")
    )
)]
pub async fn list_admin_posts(
    pool: web::Data<PgPool>,
    _user: AdminUser,
) -> Result<HttpResponse, AppError> {
    let posts: Vec<PostSummary> = sqlx::query_as(
        "SELECT id, slug, title, excerpt, created_at FROM posts ORDER BY created_at DESC",
    )
    .fetch_all(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(posts))
}

/// Create a post. The slug is derived from the title and never changes afterwards.
#[utoipa::path(
    post,
    path = "/api/admin/posts",
    tag = "admin/posts",
    security(("bearer_auth" = [])),
    request_body = CreatePostRequest,
    responses(
        (status = 201, description = "Created", body = Post),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid token")
    )
)]
pub async fn create_post(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    body: web::Json<CreatePostRequest>,
) -> Result<HttpResponse, AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::Validation("title must not be empty".into()));
    }

    let slug = unique_slug(pool.get_ref(), &body.title).await?;

    let post: Post = sqlx::query_as(
        "INSERT INTO posts (slug, title, excerpt, content_markdown, published)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *",
    )
    .bind(&slug)
    .bind(&body.title)
    .bind(&body.excerpt)
    .bind(&body.content_markdown)
    .bind(body.published)
    .fetch_one(pool.get_ref())
    .await?;

    Ok(HttpResponse::Created().json(post))
}

/// Patch a post. Omitted fields keep their current value; the slug is immutable.
#[utoipa::path(
    put,
    path = "/api/admin/posts/{id}",
    tag = "admin/posts",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path, description = "Post id")),
    request_body = UpdatePostRequest,
    responses(
        (status = 200, description = "Updated", body = Post),
        (status = 401, description = "Missing or invalid token"),
        (status = 404, description = "No post with that id")
    )
)]
pub async fn update_post(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
    body: web::Json<UpdatePostRequest>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();

    let existing: Post = sqlx::query_as("SELECT * FROM posts WHERE id = $1")
        .bind(id)
        .fetch_optional(pool.get_ref())
        .await?
        .ok_or(AppError::NotFound)?;

    let title = body.title.clone().unwrap_or(existing.title);
    let excerpt = body.excerpt.clone().unwrap_or(existing.excerpt);
    let content_markdown = body
        .content_markdown
        .clone()
        .unwrap_or(existing.content_markdown);
    let published = body.published.unwrap_or(existing.published);

    let post: Post = sqlx::query_as(
        "UPDATE posts
         SET title = $1, excerpt = $2, content_markdown = $3, published = $4, updated_at = now()
         WHERE id = $5
         RETURNING *",
    )
    .bind(&title)
    .bind(&excerpt)
    .bind(&content_markdown)
    .bind(published)
    .bind(id)
    .fetch_one(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(post))
}

/// Delete a post.
#[utoipa::path(
    delete,
    path = "/api/admin/posts/{id}",
    tag = "admin/posts",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path, description = "Post id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid token"),
        (status = 404, description = "No post with that id")
    )
)]
pub async fn delete_post(
    pool: web::Data<PgPool>,
    _user: AdminUser,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();

    let result = sqlx::query("DELETE FROM posts WHERE id = $1")
        .bind(id)
        .execute(pool.get_ref())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}
