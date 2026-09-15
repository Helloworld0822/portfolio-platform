use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, RwLock};
use std::time::{Duration, Instant};

use actix_web::body::{EitherBody, MessageBody};
use actix_web::dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::{web, Error, HttpResponse};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use futures_util::future::{ready, LocalBoxFuture, Ready};
use serde_json::json;

use crate::auth::jwt::validate_jwt;
use crate::client_ip::{client_ip, is_bannable};
use crate::config::Config;
use crate::db::PgPool;

/// Rate-limit violations one IP may accumulate inside `VIOLATION_WINDOW`
/// before it earns an automatic temporary ban. Set well above the per-endpoint
/// limits so a single impatient user is throttled, not banned; only a client
/// that keeps hammering a 429 does.
const VIOLATION_WINDOW: Duration = Duration::from_secs(600);
const VIOLATION_THRESHOLD: u32 = 10;

/// How long an automatic ban lasts. Manual bans have no expiry unless the
/// admin sets one.
const AUTO_BAN_HOURS: i64 = 1;

const AUTO_BAN_REASON: &str = "automatic: repeated rate-limit violations";

#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
pub struct IpBan {
    pub ip: String,
    pub reason: Option<String>,
    /// `None` for a permanent ban.
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
pub struct UserBlock {
    pub login: String,
    pub reason: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Bans are persisted in Postgres so they survive restarts, with an in-memory
/// snapshot serving the per-request check. Every mutation writes through to
/// both, so no database round-trip is needed to answer "is this request from a
/// banned IP?".
pub struct BanStore {
    pool: PgPool,
    ips: RwLock<HashMap<String, Option<DateTime<Utc>>>>,
    logins: RwLock<HashSet<String>>,
    violations: Mutex<HashMap<String, (Instant, u32)>>,
}

impl BanStore {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            ips: RwLock::new(HashMap::new()),
            logins: RwLock::new(HashSet::new()),
            violations: Mutex::new(HashMap::new()),
        }
    }

    /// Loads the active bans into memory, dropping bans that already expired.
    pub async fn reload(&self) -> anyhow::Result<()> {
        let conn = self.pool.get().await?;
        conn.execute(
            "DELETE FROM banned_ips WHERE expires_at IS NOT NULL AND expires_at <= now()",
            &[],
        )
        .await?;

        let ip_rows = conn
            .query("SELECT ip, expires_at FROM banned_ips", &[])
            .await?;
        let login_rows = conn.query("SELECT login FROM blocked_users", &[]).await?;

        let ips: HashMap<String, Option<DateTime<Utc>>> = ip_rows
            .iter()
            .map(|row| (row.get::<_, String>("ip"), row.get("expires_at")))
            .collect();
        let logins: HashSet<String> = login_rows
            .iter()
            .map(|row| row.get::<_, String>("login").to_lowercase())
            .collect();

        *self.ips.write().unwrap() = ips;
        *self.logins.write().unwrap() = logins;
        Ok(())
    }

    pub fn is_ip_banned(&self, ip: &str) -> bool {
        let mut ips = self.ips.write().unwrap();
        let banned = match ips.get(ip) {
            None => false,
            Some(None) => true,
            Some(Some(expires_at)) => *expires_at > Utc::now(),
        };

        if !banned {
            ips.remove(ip);
        }
        banned
    }

    pub fn is_user_blocked(&self, login: &str) -> bool {
        self.logins.read().unwrap().contains(&login.to_lowercase())
    }

    pub async fn ban_ip(
        &self,
        ip: &str,
        reason: Option<&str>,
        expires_at: Option<DateTime<Utc>>,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().await?;
        conn.execute(
            "INSERT INTO banned_ips (ip, reason, expires_at) VALUES ($1, $2, $3)
             ON CONFLICT (ip) DO UPDATE
                SET reason = EXCLUDED.reason,
                    expires_at = EXCLUDED.expires_at,
                    created_at = now()",
            &[&ip, &reason, &expires_at],
        )
        .await?;

        self.ips.write().unwrap().insert(ip.to_string(), expires_at);
        Ok(())
    }

    pub async fn unban_ip(&self, ip: &str) -> anyhow::Result<bool> {
        let conn = self.pool.get().await?;
        let affected = conn
            .execute("DELETE FROM banned_ips WHERE ip = $1", &[&ip])
            .await?;
        self.ips.write().unwrap().remove(ip);
        Ok(affected > 0)
    }

    pub async fn block_user(&self, login: &str, reason: Option<&str>) -> anyhow::Result<()> {
        let conn = self.pool.get().await?;
        conn.execute(
            "INSERT INTO blocked_users (login, reason) VALUES ($1, $2)
             ON CONFLICT (login) DO UPDATE SET reason = EXCLUDED.reason",
            &[&login, &reason],
        )
        .await?;

        self.logins.write().unwrap().insert(login.to_lowercase());
        Ok(())
    }

    pub async fn unblock_user(&self, login: &str) -> anyhow::Result<bool> {
        let conn = self.pool.get().await?;
        let affected = conn
            .execute(
                "DELETE FROM blocked_users WHERE lower(login) = lower($1)",
                &[&login],
            )
            .await?;
        self.logins.write().unwrap().remove(&login.to_lowercase());
        Ok(affected > 0)
    }

    pub async fn list_ip_bans(&self) -> anyhow::Result<Vec<IpBan>> {
        let conn = self.pool.get().await?;
        let rows = conn
            .query(
                "SELECT ip, reason, expires_at, created_at FROM banned_ips
                 ORDER BY created_at DESC",
                &[],
            )
            .await?;

        Ok(rows
            .iter()
            .map(|row| IpBan {
                ip: row.get("ip"),
                reason: row.get("reason"),
                expires_at: row.get("expires_at"),
                created_at: row.get("created_at"),
            })
            .collect())
    }

    pub async fn list_blocked_users(&self) -> anyhow::Result<Vec<UserBlock>> {
        let conn = self.pool.get().await?;
        let rows = conn
            .query(
                "SELECT login, reason, created_at FROM blocked_users
                 ORDER BY created_at DESC",
                &[],
            )
            .await?;

        Ok(rows
            .iter()
            .map(|row| UserBlock {
                login: row.get("login"),
                reason: row.get("reason"),
                created_at: row.get("created_at"),
            })
            .collect())
    }

    /// Records one rate-limit violation for `ip` and bans it temporarily once
    /// the burst threshold is reached, so a client that ignores 429s is shut
    /// out for `AUTO_BAN_HOURS`. Returns true when this call was the one that
    /// banned the address.
    pub async fn record_violation(&self, ip: &str) -> bool {
        // Private/loopback addresses are never visitors: auto-banning one would
        // lock the gateway (and therefore everyone) out of the site.
        if !is_bannable(ip) {
            return false;
        }

        let should_ban = {
            let mut violations = self.violations.lock().unwrap();
            let now = Instant::now();

            if violations.len() > 1024 {
                violations.retain(|_, (start, _)| now.duration_since(*start) < VIOLATION_WINDOW);
            }

            match violations.get_mut(ip) {
                Some((start, count)) if now.duration_since(*start) < VIOLATION_WINDOW => {
                    *count += 1;
                    *count >= VIOLATION_THRESHOLD
                }
                Some((start, count)) => {
                    *start = now;
                    *count = 1;
                    false
                }
                None => {
                    violations.insert(ip.to_string(), (now, 1));
                    false
                }
            }
        };

        if !should_ban {
            return false;
        }

        self.violations.lock().unwrap().remove(ip);
        let expires_at = Utc::now() + ChronoDuration::hours(AUTO_BAN_HOURS);
        match self
            .ban_ip(ip, Some(AUTO_BAN_REASON), Some(expires_at))
            .await
        {
            Ok(()) => {
                tracing::warn!(%ip, "temporarily banned after repeated rate-limit violations");
                true
            }
            Err(err) => {
                tracing::error!(error = %err, %ip, "could not persist automatic ban");
                false
            }
        }
    }
}

/// Rejects every request from a banned IP, for the whole app including static
/// files, so a ban cannot be sidestepped by requesting a different route.
///
/// Requests carrying a valid *admin* token are deliberately let through: the
/// owner must be able to reach `/api/admin/bans` to lift a ban even if their
/// own address ended up on the list, which keeps an over-eager ban recoverable.
pub struct BanGuard;

impl<S, B> Transform<S, ServiceRequest> for BanGuard
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Transform = BanGuardMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(BanGuardMiddleware { service }))
    }
}

pub struct BanGuardMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for BanGuardMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        if is_banned_request(&req) {
            let (request, _payload) = req.into_parts();
            let response = HttpResponse::Forbidden()
                .json(json!({ "error": "banned" }))
                .map_into_right_body();
            return Box::pin(async move { Ok(ServiceResponse::new(request, response)) });
        }

        let fut = self.service.call(req);
        Box::pin(async move { fut.await.map(ServiceResponse::map_into_left_body) })
    }
}

fn is_banned_request(req: &ServiceRequest) -> bool {
    let Some(store) = req.app_data::<web::Data<BanStore>>() else {
        return false;
    };

    if has_admin_token(req) {
        return false;
    }

    store.is_ip_banned(&client_ip(req.request()))
}

fn has_admin_token(req: &ServiceRequest) -> bool {
    let Some(config) = req.app_data::<web::Data<Config>>() else {
        return false;
    };
    let Some(token) = req
        .headers()
        .get("Authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|header| header.strip_prefix("Bearer "))
    else {
        return false;
    };

    validate_jwt(token, &config.jwt_secret)
        .map(|claims| claims.role == "admin")
        .unwrap_or(false)
}
