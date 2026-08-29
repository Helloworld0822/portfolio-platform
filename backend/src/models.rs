use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Serialize, ToSchema, sqlx::FromRow)]
pub struct Post {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub excerpt: String,
    pub content_markdown: String,
    pub published: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema, sqlx::FromRow)]
pub struct PostSummary {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub excerpt: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreatePostRequest {
    pub title: String,
    pub excerpt: String,
    pub content_markdown: String,
    pub published: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdatePostRequest {
    pub title: Option<String>,
    pub excerpt: Option<String>,
    pub content_markdown: Option<String>,
    pub published: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema, sqlx::FromRow)]
pub struct Project {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub details: Vec<String>,
    pub tags: Vec<String>,
    pub status: String,
    pub period: Option<String>,
    pub role: Option<String>,
    pub url: Option<String>,
    pub published: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateProjectRequest {
    pub title: String,
    pub description: String,
    pub details: Vec<String>,
    pub tags: Vec<String>,
    pub status: String,
    pub period: Option<String>,
    pub role: Option<String>,
    pub url: Option<String>,
    pub published: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateProjectRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub details: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub status: Option<String>,
    pub period: Option<String>,
    pub role: Option<String>,
    pub url: Option<String>,
    pub published: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema, sqlx::FromRow)]
pub struct ContactMessage {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateContactRequest {
    pub name: String,
    pub email: String,
    pub message: String,
}

#[derive(Debug, Serialize, ToSchema, sqlx::FromRow)]
pub struct Comment {
    pub id: Uuid,
    pub post_id: Uuid,
    pub author_login: String,
    pub author_avatar_url: Option<String>,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateCommentRequest {
    pub body: String,
}
