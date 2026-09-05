use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// A small in-memory fixed-window rate limiter keyed by an arbitrary string
/// (here, client IP + email). Kept in a single process-wide instance; adequate
/// for the single-instance deployment this stack targets. If the app ever runs
/// multiple replicas, move the counters to Postgres or Redis.
pub struct RateLimiter {
    window: Duration,
    max: u32,
    buckets: Mutex<HashMap<String, (Instant, u32)>>,
}

impl RateLimiter {
    pub fn new(window: Duration, max: u32) -> Self {
        Self {
            window,
            max,
            buckets: Mutex::new(HashMap::new()),
        }
    }

    /// Registers one attempt for `key` and reports whether it is within the
    /// limit. Returns false once the key exceeds `max` hits in `window`.
    pub fn check(&self, key: &str) -> bool {
        let mut buckets = self.buckets.lock().unwrap();
        let now = Instant::now();

        if buckets.len() > 1024 {
            buckets.retain(|_, (start, _)| now.duration_since(*start) < self.window);
        }

        match buckets.get_mut(key) {
            Some((start, count)) if now.duration_since(*start) < self.window => {
                if *count >= self.max {
                    return false;
                }
                *count += 1;
                true
            }
            Some((start, count)) => {
                *start = now;
                *count = 1;
                true
            }
            None => {
                buckets.insert(key.to_string(), (now, 1));
                true
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_up_to_max_then_blocks() {
        let limiter = RateLimiter::new(Duration::from_secs(60), 3);
        assert!(limiter.check("ip|a@example.com"));
        assert!(limiter.check("ip|a@example.com"));
        assert!(limiter.check("ip|a@example.com"));
        assert!(!limiter.check("ip|a@example.com"));
        assert!(!limiter.check("ip|a@example.com"));
    }

    #[test]
    fn tracks_keys_independently() {
        let limiter = RateLimiter::new(Duration::from_secs(60), 2);
        assert!(limiter.check("ip|a@example.com"));
        assert!(limiter.check("ip|a@example.com"));
        assert!(!limiter.check("ip|a@example.com"));
        assert!(limiter.check("ip|b@example.com"));
    }
}
