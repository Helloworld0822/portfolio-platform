use utoipa::openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme};
use utoipa::{Modify, OpenApi};

use crate::models;
use crate::routes;

/// Registers the `bearer_auth` scheme so the Swagger UI shows an Authorize
/// button for the admin endpoints.
pub struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi
            .components
            .get_or_insert_with(utoipa::openapi::Components::default);

        components.add_security_scheme(
            "bearer_auth",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .bearer_format("JWT")
                    .description(Some(
                        "JWT issued by /api/auth/github/callback. Send as `Bearer <token>`.",
                    ))
                    .build(),
            ),
        );
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Portfolio Platform API",
        version = "0.1.0",
        description = "Blog posts, portfolio projects, and contact messages for the portfolio site. \
                       Public endpoints are open; `/api/admin/*` requires the admin JWT."
    ),
    modifiers(&SecurityAddon),
    tags(
        (name = "health", description = "Liveness"),
        (name = "posts", description = "Public blog posts"),
        (name = "comments", description = "Blog post comments"),
        (name = "projects", description = "Public portfolio projects"),
        (name = "contact", description = "Contact form submissions"),
        (name = "auth", description = "GitHub OAuth login for the single admin"),
        (name = "admin/posts", description = "Post management"),
        (name = "admin/projects", description = "Project management"),
        (name = "admin/contact", description = "Received contact messages")
    ),
    paths(
        routes::health::health,
        routes::posts::list_posts,
        routes::posts::get_post,
        routes::comments::list_comments,
        routes::comments::create_comment,
        routes::comments::delete_comment,
        routes::posts::list_admin_posts,
        routes::posts::get_admin_post,
        routes::posts::create_post,
        routes::posts::update_post,
        routes::posts::delete_post,
        routes::projects::list_projects,
        routes::projects::list_admin_projects,
        routes::projects::create_project,
        routes::projects::update_project,
        routes::projects::delete_project,
        routes::contact::create_contact_message,
        routes::contact::list_contact_messages,
        routes::auth_routes::github_login,
        routes::auth_routes::github_callback,
    ),
    components(schemas(
        models::Post,
        models::PostSummary,
        models::CreatePostRequest,
        models::UpdatePostRequest,
        models::Comment,
        models::CreateCommentRequest,
        models::Project,
        models::CreateProjectRequest,
        models::UpdateProjectRequest,
        models::ContactMessage,
        models::CreateContactRequest,
    ))
)]
pub struct ApiDoc;

#[cfg(test)]
mod tests {
    use super::ApiDoc;
    use utoipa::OpenApi;

    #[test]
    fn spec_covers_every_route_and_declares_bearer_auth() {
        let spec = ApiDoc::openapi();

        for path in [
            "/api/health",
            "/api/posts",
            "/api/posts/{slug}",
            "/api/posts/{slug}/comments",
            "/api/admin/comments/{id}",
            "/api/projects",
            "/api/contact",
            "/api/auth/github/login",
            "/api/auth/github/callback",
            "/api/admin/posts",
            "/api/admin/posts/{id}",
            "/api/admin/projects",
            "/api/admin/projects/{id}",
            "/api/admin/contact",
        ] {
            assert!(
                spec.paths.paths.contains_key(path),
                "openapi spec is missing {path}"
            );
        }

        let components = spec.components.expect("components should be present");
        assert!(components.security_schemes.contains_key("bearer_auth"));
    }
}
