const publicHosts = new Set([
  "helloworld0822.xyz",
  "portfolio.helloworld0822.xyz",
  "blog.helloworld0822.xyz",
]);
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const tokenCache = new WeakMap();
const oauthErrors = new Set(["invalid_grant", "invalid_client", "invalid_request",
  "unauthorized_client", "access_denied", "unsupported_grant_type", "temporarily_unavailable"]);


function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function encodedJson(value) {
  return encode(new TextEncoder().encode(JSON.stringify(value)));
}

function decode(value) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
}

function runOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".run.app") || url.port ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Invalid Cloud Run origin");
  }
  return url.origin;
}

async function idToken(env, audience, send, diagnostic) {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(env);
  if (cached && cached.audience === audience && now + 90 < cached.expires) return cached.token;
  diagnostic.stage = "token-config";
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) throw new Error();
  diagnostic.stage = "signing-key";
  const pem = env.GOOGLE_PRIVATE_KEY.trim();
  const match = /^-----BEGIN PRIVATE KEY-----([a-zA-Z0-9+/=\s]+)-----END PRIVATE KEY-----$/.exec(pem);
  if (!match) throw new Error("Invalid signing key");
  const algo = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  const key = await crypto.subtle.importKey("pkcs8", decode(match[1].replace(/\s/g, "")), algo, false, ["sign"]);
  const claims = { iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, aud: tokenEndpoint,
    target_audience: audience, iat: now, exp: now + 300 };
  const jwt = encodedJson({ alg: "RS256", typ: "JWT" }) + "." + encodedJson(claims);
  diagnostic.stage = "sign-assertion";
  const signature = await crypto.subtle.sign(algo, key, new TextEncoder().encode(jwt));
  diagnostic.stage = "token-network";
  const response = await send(tokenEndpoint, {
    method: "POST",
    redirect: "manual",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt + "." + encode(new Uint8Array(signature)),
    }),
  });
  if (!response.ok) {
    diagnostic.stage = "token-exchange";
    diagnostic.status = response.status;
    const body = await response.json().catch(() => null);
    diagnostic.oauth = oauthErrors.has(body?.error) ? body.error : "other";
    throw new Error();
  }
  diagnostic.stage = "token-decode";
  const { id_token: token } = await response.json();
  const payload = JSON.parse(new TextDecoder().decode(decode(token.split(".")[1])));
  diagnostic.stage = "token-claims";
  if (payload.aud !== audience || !Number.isSafeInteger(payload.exp) || payload.exp <= now) {
    throw new Error("Unexpected ID token");
  }
  tokenCache.set(env, { token, audience, expires: payload.exp });
  return token;
}

function plainError(status, message) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store" } });
}

export async function forward(request, env, send = fetch) {
  const incoming = new URL(request.url);
  if ((!publicHosts.has(incoming.hostname) && incoming.hostname !== env.TEST_HOST) ||
      incoming.port || incoming.username || incoming.password) return plainError(404, "Not found");
  if (incoming.protocol === "http:") {
    incoming.protocol = "https:";
    return Response.redirect(incoming.href, 308);
  }
  if (incoming.protocol !== "https:") return plainError(400, "Invalid scheme");
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip || !/^[\da-f:.]{2,45}$/i.test(ip)) return plainError(400, "Missing client address");

  const diagnostic = { stage: "origin-config" };
  try {
    const origin = runOrigin(env.RUN_ORIGIN);
    const upstream = new URL(origin);
    upstream.pathname = incoming.pathname;
    upstream.search = incoming.search;
    diagnostic.stage = "token-cache";
    const token = await idToken(env, env.GOOGLE_AUDIENCE || origin, send, diagnostic);
    diagnostic.stage = "request-headers";
    const headers = new Headers(request.headers);
    for (const name of [...headers.keys()]) {
      if (name.startsWith("x-forwarded-") || name.startsWith("cf-") ||
          ["host", "connection", "proxy-authorization", "forwarded", "via", "true-client-ip",
           "x-real-ip", "x-portfolio-client-ip", "x-serverless-authorization"].includes(name)) {
        headers.delete(name);
      }
    }
    headers.set("X-Portfolio-Client-IP", ip);
    headers.set("X-Forwarded-Host", incoming.hostname);
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Serverless-Authorization", "Bearer " + token);
    diagnostic.stage = "origin-fetch";
    const response = await send(upstream.href, {
      method: request.method, headers, body: request.body, redirect: "manual", cache: "no-store",
    });
    diagnostic.stage = "origin-response";
    const result = new Response(response.body, response);
    const location = result.headers.get("Location");
    if (location) {
      const next = new URL(location, upstream);
      if (next.origin === origin) {
        next.host = incoming.host;
        result.headers.set("Location", next.href);
      }
    }
    if (request.headers.has("Authorization") || request.headers.has("Cookie") ||
        result.headers.has("Set-Cookie") || incoming.pathname.startsWith("/api/")) {
      result.headers.set("Cache-Control", "private, no-store");
    }
    if (incoming.hostname === env.TEST_HOST) result.headers.set("X-Robots-Tag", "noindex");
    return result;
  } catch {
    console.warn("portfolio-edge", diagnostic);
    const result = plainError(502, "Upstream unavailable");
    if (incoming.hostname === env.TEST_HOST) {
      result.headers.set("X-Portfolio-Stage-Error", [diagnostic.stage, diagnostic.status, diagnostic.oauth].filter(Boolean).join("/"));
    }
    return result;
  }
}

export default { fetch: (request, env) => forward(request, env) };
