-- Abuse controls: IP bans (added by an admin or automatically after repeated
-- rate-limit violations) and blocked GitHub logins.
CREATE TABLE banned_ips (
    ip TEXT PRIMARY KEY,
    reason TEXT,
    -- NULL means a permanent ban; automatic bans carry an expiry.
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE blocked_users (
    login TEXT PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GitHub logins are unique case-insensitively, so "Foo" and "foo" are the same
-- account and must not both be blockable.
CREATE UNIQUE INDEX blocked_users_login_lower_idx ON blocked_users (lower(login));