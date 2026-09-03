pub mod app;
pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod github_repo;
pub mod models;
pub mod openapi;
pub mod routes;
pub mod slug;

use actix_web::{web, App, HttpServer};

use config::Config;

pub async fn run(config: Config) -> anyhow::Result<()> {
    let pool = db::create_pool(&config.database_url).await?;
    db::run_migrations(&pool).await?;
    std::fs::create_dir_all(&config.upload_dir)?;

    let bind_addr = format!("{}:{}", config.host, config.port);
    tracing::info!(%bind_addr, "starting portfolio-platform api");

    let cors_origins = config.cors_allowed_origins.clone();
    let config_data = web::Data::new(config);
    let pool_data = web::Data::new(pool);

    HttpServer::new(move || {
        App::new()
            .app_data(web::PayloadConfig::new(25 * 1024 * 1024))
            // Uploaded files are user-supplied: `sandbox` + `nosniff` stop an
            // SVG (or any file whose MIME the browser mis-detects as HTML) from
            // executing scripts in the site origin when opened directly.
            .service(
                web::scope("/uploads")
                    .wrap(
                        actix_web::middleware::DefaultHeaders::new()
                            .add(("Content-Security-Policy", "sandbox")),
                    )
                    .wrap(
                        actix_web::middleware::DefaultHeaders::new()
                            .add(("X-Content-Type-Options", "nosniff")),
                    )
                    .service(actix_files::Files::new("", config_data.upload_dir.clone())),
            )
            .wrap(app::build_cors(&cors_origins))
            .wrap(tracing_actix_web::TracingLogger::default())
            .app_data(config_data.clone())
            .app_data(pool_data.clone())
            .configure(app::configure_app)
    })
    .bind(bind_addr)?
    .run()
    .await?;

    Ok(())
}
