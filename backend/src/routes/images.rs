use std::{path::Path, time::Duration};

use actix_web::{web, HttpResponse};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use super::uploads::{UploadResponse, MAX_FILE_BYTES};
use crate::{auth::middleware::AdminUser, config::Config, error::AppError};

#[derive(Deserialize, utoipa::ToSchema)]
pub struct GenerateImage {
    prompt: String,
}

#[derive(Deserialize)]
struct ImageResponse<'a> {
    #[serde(borrow)]
    data: Vec<ImageData<'a>>,
}

#[derive(Deserialize)]
struct ImageData<'a> {
    b64_json: &'a str,
}

async fn request_png(config: &Config, key: &str, prompt: &str) -> anyhow::Result<Vec<u8>> {
    let mut response = reqwest::Client::new()
        .post(&config.image_generation_url)
        .bearer_auth(key)
        .timeout(Duration::from_secs(105))
        .json(&json!({
            "model": "gpt-image-2", "prompt": prompt, "n": 1,
            "size": "1024x1024", "output_format": "png", "quality": "low"
        }))
        .send()
        .await?
        .error_for_status()?;
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        anyhow::ensure!(body.len() + chunk.len() <= MAX_FILE_BYTES.div_ceil(3) * 4 + 65536);
        body.extend_from_slice(&chunk);
    }

    let images: ImageResponse = serde_json::from_slice(&body)?;
    let [image] = images.data.as_slice() else {
        anyhow::bail!("unexpected image count");
    };
    let png = STANDARD.decode(image.b64_json)?;
    anyhow::ensure!(
        png.len() <= MAX_FILE_BYTES
            && png.starts_with(b"\x89PNG\r\n\x1a\n")
            && png.ends_with(b"\x00\x00\x00\x00IEND\xaeB\x60\x82")
    );
    Ok(png)
}

#[utoipa::path(
    post, path = "/api/admin/images/generate", tag = "admin/uploads",
    security(("bearer_auth" = [])), request_body = GenerateImage,
    responses(
        (status = 201, description = "Generated image", body = UploadResponse),
        (status = 400, description = "Invalid prompt"),
        (status = 401, description = "Admin authentication required"),
        (status = 502, description = "Image generation failed"),
        (status = 503, description = "Image generation is not configured")
    )
)]
pub async fn generate_image(
    _user: AdminUser,
    config: web::Data<Config>,
    input: web::Json<GenerateImage>,
) -> Result<HttpResponse, AppError> {
    let prompt = input.prompt.trim();
    if prompt.is_empty() || prompt.encode_utf16().count() > 1000 {
        return Err(AppError::Validation(
            "prompt must contain 1 to 1000 UTF-16 code units".into(),
        ));
    }
    let Some(key) = &config.openai_api_key else {
        return Ok(HttpResponse::ServiceUnavailable()
            .json(json!({"error": "image_generation_unavailable"})));
    };
    let Ok(png) = request_png(&config, key, prompt).await else {
        return Ok(HttpResponse::BadGateway().json(json!({"error": "image_generation_failed"})));
    };

    tokio::fs::create_dir_all(&config.upload_dir)
        .await
        .map_err(anyhow::Error::from)?;
    let name = format!("{}.png", Uuid::new_v4());
    let path = Path::new(&config.upload_dir).join(&name);
    if let Err(err) = tokio::fs::write(&path, png).await {
        let _ = tokio::fs::remove_file(path).await;
        return Err(anyhow::Error::from(err).into());
    }
    Ok(HttpResponse::Created().json(UploadResponse {
        url: format!("/uploads/{name}"),
    }))
}
