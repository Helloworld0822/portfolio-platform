use std::net::IpAddr;

use actix_web::HttpRequest;

/// The nginx gateway sets X-Real-IP to the real client address (taken from
/// Cloudflare's CF-Connecting-IP). Only trust that header when the direct TCP
/// peer is private/loopback, i.e. the request actually came from the gateway
/// on the container network — otherwise any caller could inject an arbitrary
/// X-Real-IP and rotate past the per-IP rate limit or a ban for free. Falls
/// back to the real peer address in every other case.
pub fn client_ip(req: &HttpRequest) -> String {
    let from_trusted_proxy = req
        .peer_addr()
        .map(|addr| is_private_or_loopback(addr.ip()))
        .unwrap_or(false);

    if from_trusted_proxy {
        let trusted_ip = req
            .headers()
            .get("x-real-ip")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<IpAddr>().ok());
        if let Some(ip) = trusted_ip {
            return ip.to_string();
        }
    }

    req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Whether an address may be banned at all. Private, loopback, link-local and
/// unspecified addresses are never visitors' addresses: banning one of them
/// would either lock out the gateway (and with it every visitor) or be
/// meaningless, so every ban path refuses them.
pub fn is_bannable(ip: &str) -> bool {
    match ip.parse::<IpAddr>() {
        Ok(IpAddr::V4(v4)) => {
            !(v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified())
        }
        Ok(IpAddr::V6(v6)) => !(v6.is_loopback() || v6.is_unspecified()),
        Err(_) => false,
    }
}

fn is_private_or_loopback(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private(),
        IpAddr::V6(v6) => v6.is_loopback(),
    }
}

#[cfg(test)]
mod tests {
    use super::is_bannable;

    #[test]
    fn allows_public_addresses() {
        assert!(is_bannable("203.0.113.7"));
        assert!(is_bannable("2001:db8::1"));
    }

    #[test]
    fn refuses_gateway_and_private_addresses() {
        assert!(!is_bannable("127.0.0.1"));
        assert!(!is_bannable("172.18.0.1"));
        assert!(!is_bannable("10.1.2.3"));
        assert!(!is_bannable("192.168.0.10"));
        assert!(!is_bannable("169.254.1.1"));
        assert!(!is_bannable("::1"));
    }

    #[test]
    fn refuses_non_addresses() {
        assert!(!is_bannable("not-an-ip"));
        assert!(!is_bannable(""));
        assert!(!is_bannable("203.0.113.7/24"));
    }
}
