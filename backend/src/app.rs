use actix_cors::Cors;
use actix_web::{http, web};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::openapi::ApiDoc;
use crate::routes;

pub fn configure_app(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/health", web::get().to(routes::health::health))
            // Public blog
            .route("/posts", web::get().to(routes::posts::list_posts))
            .route("/posts/{slug}", web::get().to(routes::posts::get_post))
            .route(
                "/posts/{slug}/comments",
                web::get().to(routes::comments::list_comments),
            )
            .route(
                "/posts/{slug}/comments",
                web::post().to(routes::comments::create_comment),
            )
            // Public portfolio content
            .route("/projects", web::get().to(routes::projects::list_projects))
            // Public contact form
            .route(
                "/contact",
                web::post().to(routes::contact::create_contact_message),
            )
            // Admin auth
            .route(
                "/auth/github/login",
                web::get().to(routes::auth_routes::github_login),
            )
            .route(
                "/auth/github/callback",
                web::get().to(routes::auth_routes::github_callback),
            )
            // Admin blog
            .route("/admin/posts", web::get().to(routes::posts::list_admin_posts))
            .route("/admin/posts", web::post().to(routes::posts::create_post))
            .route("/admin/posts/{id}", web::put().to(routes::posts::update_post))
            .route(
                "/admin/posts/{id}",
                web::delete().to(routes::posts::delete_post),
            )
            // Admin portfolio content
            .route(
                "/admin/projects",
                web::get().to(routes::projects::list_admin_projects),
            )
            .route(
                "/admin/projects",
                web::post().to(routes::projects::create_project),
            )
            .route(
                "/admin/projects/{id}",
                web::put().to(routes::projects::update_project),
            )
            .route(
                "/admin/projects/{id}",
                web::delete().to(routes::projects::delete_project),
            )
            // Admin inbox
            .route(
                "/admin/contact",
                web::get().to(routes::contact::list_contact_messages),
            )
            // Admin comment moderation
            .route(
                "/admin/comments/{id}",
                web::delete().to(routes::comments::delete_comment),
            ),
    );

    // Mounted under /api so the nginx gateway's existing `location /api/` rule
    // proxies the docs without extra configuration.
    cfg.service(
        SwaggerUi::new("/api/docs/{_:.*}").url("/api/openapi.json", ApiDoc::openapi()),
    );
}

pub fn build_cors(allowed_origins: &[String]) -> Cors {
    let mut cors = Cors::default()
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![http::header::AUTHORIZATION, http::header::CONTENT_TYPE])
        .max_age(3600);

    for origin in allowed_origins {
        cors = cors.allowed_origin(origin);
    }

    cors
}
