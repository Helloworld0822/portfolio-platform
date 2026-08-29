pub mod app;
pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod models;
pub mod openapi;
pub mod routes;
pub mod slug;

use actix_web::{web, App, HttpServer};

use config::Config;

pub async fn run(config: Config) -> anyhow::Result<()> {
    let pool = db::create_pool(&config.database_url).await?;
    db::run_migrations(&pool).await?;

    let bind_addr = format!("{}:{}", config.host, config.port);
    tracing::info!(%bind_addr, "starting portfolio-platform api");

    let cors_origins = config.cors_allowed_origins.clone();
    let config_data = web::Data::new(config);
    let pool_data = web::Data::new(pool);

    HttpServer::new(move || {
        App::new()
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
