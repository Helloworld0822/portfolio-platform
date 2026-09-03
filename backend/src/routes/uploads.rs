use actix_multipart::Multipart;
use actix_web::{web, HttpResponse};
use futures_util::StreamExt;
use serde_json::json;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::config::Config;
use crate::error::AppError;

const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf"];
const MAX_FILE_BYTES: usize = 20 * 1024 * 1024;

/// Upload an image or PDF for use in posts or project attachments. Saves the
/// file under the configured upload dir and returns its public /uploads URL.
#[utoipa::path(
    post,
    path = "/api/admin/uploads",
    tag = "admin/uploads",
    security(("bearer_auth" = [])),
    responses(
        (status = 201, description = "Uploaded", body = UploadResponse),
        (status = 400, description = "Unsupported type or too large"),
        (status = 401, description = "Missing or invalid token")
    )
)]
pub async fn upload_file(
    config: web::Data<Config>,
    _user: AdminUser,
    mut payload: Multipart,
) -> Result<HttpResponse, AppError> {
    let mut stored_name: Option<String> = None;

    while let Some(field) = payload.next().await {
        let mut field = field.map_err(|e| anyhow::anyhow!("multipart read failed: {e}"))?;
        if field.name() != Some("file") {
            continue;
        }

        let file_name = field
            .content_disposition()
            .and_then(|cd| cd.get_filename())
            .map(str::to_owned)
            .unwrap_or_else(|| "upload".to_string());
        let ext = file_name
            .rsplit_once('.')
            .map(|(_, e)| e.to_ascii_lowercase())
            .unwrap_or_default();
        if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
            return Err(AppError::Validation(format!(
                "unsupported file type: {ext}"
            )));
        }

        tokio::fs::create_dir_all(&config.upload_dir)
            .await
            .map_err(anyhow::Error::from)?;
        let stored = format!("{}.{}", Uuid::new_v4(), ext);
        let path = std::path::Path::new(&config.upload_dir).join(&stored);
        let mut file = tokio::fs::File::create(&path)
            .await
            .map_err(anyhow::Error::from)?;
        let mut written = 0usize;

        while let Some(chunk) = field.next().await {
            let chunk = chunk.map_err(|e| anyhow::anyhow!("read chunk failed: {e}"))?;
            written += chunk.len();
            if written > MAX_FILE_BYTES {
                let _ = tokio::fs::remove_file(&path).await;
                return Err(AppError::Validation("file exceeds 20MB limit".into()));
            }
            file.write_all(&chunk).await.map_err(anyhow::Error::from)?;
        }
        file.flush().await.map_err(anyhow::Error::from)?;
        drop(file);

        stored_name = Some(stored);
    }

    let name = stored_name.ok_or_else(|| AppError::Validation("missing 'file' field".into()))?;
    Ok(HttpResponse::Created().json(json!({ "url": format!("/uploads/{name}") })))
}

#[derive(utoipa::ToSchema, serde::Serialize)]
pub struct UploadResponse {
    url: String,
}
