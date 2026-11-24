use crate::{db::PgPool, error::AppError};
use actix_web::{web, HttpResponse};

#[utoipa::path(get, path = "/api/profile", tag = "profile", responses((status = 200, body = Profile)))]
pub async fn get(pool: web::Data<PgPool>) -> Result<HttpResponse, AppError> {
    let row = pool
        .get()
        .await?
        .query_one("SELECT content FROM portfolio_profile WHERE singleton", &[])
        .await?;
    Ok(HttpResponse::Ok().json(row.try_get::<_, serde_json::Value>("content")?))
}

#[derive(serde::Deserialize, serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    name: String,
    english_name: String,
    affiliation: String,
    statement: String,
    bio: String,
    photo: String,
    github: String,
    skills: Vec<SkillGroup>,
}

#[derive(serde::Deserialize, serde::Serialize, utoipa::ToSchema)]
struct SkillGroup {
    category: String,
    items: Vec<Skill>,
}

#[derive(serde::Deserialize, serde::Serialize, utoipa::ToSchema)]
struct Skill {
    name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    children: Vec<String>,
}

#[utoipa::path(put, path = "/api/admin/profile", tag = "profile", security(("bearer_auth" = [])), request_body = Profile, responses((status = 200, body = Profile), (status = 400, description = "Invalid profile"), (status = 401, description = "Authentication required")))]
pub async fn update(
    pool: web::Data<PgPool>,
    _admin: crate::auth::middleware::AdminUser,
    body: web::Json<Profile>,
) -> Result<HttpResponse, AppError> {
    let profile = body.into_inner();
    if profile.name.trim().is_empty()
        || profile.github.is_empty()
        || !profile
            .github
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        || profile.skills.iter().any(|g| {
            g.category.trim().is_empty() || g.items.iter().any(|s| s.name.trim().is_empty())
        })
    {
        return Err(AppError::Validation(
            "이름, GitHub 계정 및 기술 이름을 확인해 주세요.".into(),
        ));
    }
    if profile.photo != "/images/jaemin.jpg"
        && !super::timeline::is_uploaded_image(&profile.photo)
        && !reqwest::Url::parse(&profile.photo)
            .is_ok_and(|u| u.scheme() == "https" && u.host().is_some())
    {
        return Err(AppError::Validation(
            "프로필 사진 주소를 확인해 주세요.".into(),
        ));
    }
    let value = serde_json::json!(profile);
    pool.get()
        .await?
        .execute(
            "UPDATE portfolio_profile SET content=$1 WHERE singleton",
            &[&value],
        )
        .await?;
    Ok(HttpResponse::Ok().json(value))
}
