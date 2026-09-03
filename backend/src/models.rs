use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio_postgres::Row;
use utoipa::ToSchema;
use uuid::Uuid;

fn row_err() -> anyhow::Error {
    anyhow::anyhow!("failed to decode a database row")
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
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

impl TryFrom<&Row> for Post {
    type Error = anyhow::Error;
    fn try_from(row: &Row) -> Result<Self, Self::Error> {
        Ok(Post {
            id: row.try_get::<_, Uuid>("id").map_err(|_| row_err())?,
            slug: row.try_get::<_, String>("slug").map_err(|_| row_err())?,
            title: row.try_get::<_, String>("title").map_err(|_| row_err())?,
            excerpt: row.try_get::<_, String>("excerpt").map_err(|_| row_err())?,
            content_markdown: row
                .try_get::<_, String>("content_markdown")
                .map_err(|_| row_err())?,
            published: row.try_get::<_, bool>("published").map_err(|_| row_err())?,
            created_at: row
                .try_get::<_, DateTime<Utc>>("created_at")
                .map_err(|_| row_err())?,
            updated_at: row
                .try_get::<_, DateTime<Utc>>("updated_at")
                .map_err(|_| row_err())?,
        })
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct PostSummary {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub excerpt: String,
    pub created_at: DateTime<Utc>,
}

impl TryFrom<&Row> for PostSummary {
    type Error = anyhow::Error;
    fn try_from(row: &Row) -> Result<Self, Self::Error> {
        Ok(PostSummary {
            id: row.try_get::<_, Uuid>("id").map_err(|_| row_err())?,
            slug: row.try_get::<_, String>("slug").map_err(|_| row_err())?,
            title: row.try_get::<_, String>("title").map_err(|_| row_err())?,
            excerpt: row.try_get::<_, String>("excerpt").map_err(|_| row_err())?,
            created_at: row
                .try_get::<_, DateTime<Utc>>("created_at")
                .map_err(|_| row_err())?,
        })
    }
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

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProjectAttachment {
    pub name: String,
    pub url: String,
    pub kind: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
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
    pub demo_url: Option<String>,
    pub repo_languages: serde_json::Value,
    pub repo_private: bool,
    pub attachments: Vec<ProjectAttachment>,
    pub published: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl TryFrom<&Row> for Project {
    type Error = anyhow::Error;
    fn try_from(row: &Row) -> Result<Self, Self::Error> {
        Ok(Project {
            id: row.try_get::<_, Uuid>("id").map_err(|_| row_err())?,
            title: row.try_get::<_, String>("title").map_err(|_| row_err())?,
            description: row
                .try_get::<_, String>("description")
                .map_err(|_| row_err())?,
            details: row
                .try_get::<_, Vec<String>>("details")
                .map_err(|_| row_err())?,
            tags: row
                .try_get::<_, Vec<String>>("tags")
                .map_err(|_| row_err())?,
            status: row.try_get::<_, String>("status").map_err(|_| row_err())?,
            period: row
                .try_get::<_, Option<String>>("period")
                .map_err(|_| row_err())?,
            role: row
                .try_get::<_, Option<String>>("role")
                .map_err(|_| row_err())?,
            url: row
                .try_get::<_, Option<String>>("url")
                .map_err(|_| row_err())?,
            demo_url: row
                .try_get::<_, Option<String>>("demo_url")
                .map_err(|_| row_err())?,
            repo_languages: row
                .try_get::<_, serde_json::Value>("repo_languages")
                .unwrap_or_else(|_| serde_json::json!({})),
            repo_private: row
                .try_get::<_, bool>("repo_private")
                .map_err(|_| row_err())?,
            attachments: row
                .try_get::<_, serde_json::Value>("attachments")
                .map_err(|_| row_err())
                .and_then(|v| serde_json::from_value(v).map_err(|_| row_err()))?,
            published: row.try_get::<_, bool>("published").map_err(|_| row_err())?,
            created_at: row
                .try_get::<_, DateTime<Utc>>("created_at")
                .map_err(|_| row_err())?,
            updated_at: row
                .try_get::<_, DateTime<Utc>>("updated_at")
                .map_err(|_| row_err())?,
        })
    }
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
    pub demo_url: Option<String>,
    #[serde(default)]
    pub attachments: Vec<ProjectAttachment>,
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
    pub demo_url: Option<String>,
    pub attachments: Option<Vec<ProjectAttachment>>,
    pub published: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ContactMessage {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
}

impl TryFrom<&Row> for ContactMessage {
    type Error = anyhow::Error;
    fn try_from(row: &Row) -> Result<Self, Self::Error> {
        Ok(ContactMessage {
            id: row.try_get::<_, Uuid>("id").map_err(|_| row_err())?,
            name: row.try_get::<_, String>("name").map_err(|_| row_err())?,
            email: row.try_get::<_, String>("email").map_err(|_| row_err())?,
            message: row.try_get::<_, String>("message").map_err(|_| row_err())?,
            created_at: row
                .try_get::<_, DateTime<Utc>>("created_at")
                .map_err(|_| row_err())?,
        })
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateContactRequest {
    pub name: String,
    pub email: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct Comment {
    pub id: Uuid,
    pub post_id: Uuid,
    pub author_login: String,
    pub author_avatar_url: Option<String>,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

impl TryFrom<&Row> for Comment {
    type Error = anyhow::Error;
    fn try_from(row: &Row) -> Result<Self, Self::Error> {
        Ok(Comment {
            id: row.try_get::<_, Uuid>("id").map_err(|_| row_err())?,
            post_id: row.try_get::<_, Uuid>("post_id").map_err(|_| row_err())?,
            author_login: row
                .try_get::<_, String>("author_login")
                .map_err(|_| row_err())?,
            author_avatar_url: row
                .try_get::<_, Option<String>>("author_avatar_url")
                .map_err(|_| row_err())?,
            body: row.try_get::<_, String>("body").map_err(|_| row_err())?,
            created_at: row
                .try_get::<_, DateTime<Utc>>("created_at")
                .map_err(|_| row_err())?,
        })
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateCommentRequest {
    pub body: String,
}
