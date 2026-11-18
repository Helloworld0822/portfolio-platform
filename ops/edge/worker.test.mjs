import { strict as assert } from "node:assert";
import { test } from "node:test";
import { forward } from "./worker.mjs";

const keys = await crypto.subtle.generateKey({
  name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
}, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");
const origin = "https://portfolio-fixture.a.run.app";
const host = "portfolio.helloworld0822.xyz";
const tokenUrl = "https://oauth2.googleapis.com/token";
const jsonPart = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");

function fixture(options = {}) {
  const env = {
    GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\n" + pkcs8 + "\n-----END PRIVATE KEY-----",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "edge@example.iam.gserviceaccount.com",
    RUN_ORIGIN: origin, ...options,
  };
  const exchanges = [];
  const upstream = [];
  const send = async (url, init) => {
    if (url === tokenUrl) {
      assert.equal(init.redirect, "manual");
      assert.equal(init.body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      const [header, payload, signature] = init.body.get("assertion").split(".");
      assert.equal(JSON.parse(Buffer.from(header,"base64url")).alg,"RS256");
      assert.ok(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", keys.publicKey,
        Buffer.from(signature,"base64url"), new TextEncoder().encode(header + "." + payload)));
      const claims = JSON.parse(Buffer.from(payload,"base64url"));
      assert.equal(claims.iss, env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
      assert.equal(claims.aud, tokenUrl);
      assert.equal(claims.target_audience, env.GOOGLE_AUDIENCE || origin);
      const exp = Math.floor(Date.now() / 1000) + (options.lifetime || 3600);
      const token = "a." + jsonPart({aud: claims.target_audience, exp}) + ".sig";
      exchanges.push(token);
      return Response.json({id_token:token});
    }
    upstream.push({url,init});
    return options.reply?.() || new Response("ok");
  };
  return {env,send,exchanges,upstream};
}

function req(path = "/", init = {}) {
  return new Request("https://" + host + path, {
    ...init, headers: {"CF-Connecting-IP": "2001:db8::1", ...init.headers},
  });
}

test("only exact hosts enter and HTTP upgrades before requesting credentials", async () => {
  const {env,send,exchanges,upstream}=fixture({TEST_HOST:"edge-check.helloworld0822.xyz"});
  for (const h of ["other.xyz","portfolio.helloworld0822.xyz.evil.test","evil.helloworld0822.xyz",host+":8443"]) {
    assert.equal((await forward(new Request("https://"+h+"/"),env,send)).status,404);
  }
  const http=await forward(new Request("http://blog.helloworld0822.xyz/path?x=1"),env,send);
  assert.equal(http.status,308);
  assert.equal(http.headers.get("Location"),"https://blog.helloworld0822.xyz/path?x=1");
  assert.equal((await forward(new Request("https://"+host),env,send)).status,400);
  assert.equal(exchanges.length+upstream.length,0);
  const stage=await forward(new Request("https://"+env.TEST_HOST,{headers:{"CF-Connecting-IP":"1.2.3.4"}}),env,send);
  assert.equal(stage.headers.get("X-Robots-Tag"),"noindex");
});

test("signed service token and visitor auth coexist on streamed requests to a fixed origin",async()=>{
  const f=fixture({GOOGLE_AUDIENCE:"https://canonical.run.app"});
  const input=req("//third-party.test/a?q=%2B",{method:"POST",body:"upload",headers:{
    Authorization:"Bearer visitor",Cookie:"session=visitor",Forwarded:"spoof", "X-Forwarded-For":"127.0.0.1",
    "X-Real-IP":"127.0.0.1","X-Portfolio-Client-IP":"127.0.0.1","X-Serverless-Authorization":"Bearer spoof",
  }});
  const response=await forward(input,f.env,f.send);
  assert.equal(response.status,200);
  const {url,init}=f.upstream[0];
  assert.equal(url,origin+"//third-party.test/a?q=%2B");
  assert.equal(init.method,"POST");
  assert.equal(await new Response(init.body).text(),"upload");
  assert.equal(init.headers.get("authorization"),"Bearer visitor");
  assert.equal(init.headers.get("cookie"),"session=visitor");
  assert.equal(init.headers.get("x-serverless-authorization"),"Bearer "+f.exchanges[0]);
  assert.equal(init.headers.get("x-portfolio-client-ip"),"2001:db8::1");
  assert.equal(init.headers.get("x-forwarded-host"),host);
  for(const h of ["forwarded","x-forwarded-for","x-real-ip","host"]) assert.equal(init.headers.get(h),null);
  assert.equal(init.redirect,"manual");
  assert.equal(init.cache,"no-store");
  assert.equal(response.headers.get("cache-control"),"private, no-store");
  await forward(req("/api/projects"),f.env,f.send);
  assert.equal(f.exchanges.length,1);
});

test("refreshes near expiry, keeps OAuth redirect external and browser cookies intact",async()=>{
  const f=fixture({lifetime:60,reply:()=>new Response(null,{status:302,headers:{
    Location:"https://github.com/login/oauth/authorize", "Set-Cookie":"s=1; HttpOnly",
  }})});
  for(let i=0;i<2;i++){
    const r=await forward(req("/api/auth/github/login"),f.env,f.send);
    assert.equal(r.status,302);
    assert.equal(r.headers.get("Location"),"https://github.com/login/oauth/authorize");
    assert.equal(r.headers.get("Set-Cookie"),"s=1; HttpOnly");
  }
  assert.equal(f.exchanges.length,2);
  assert.equal(f.upstream.length,2);
});

test("origin redirects preserve public hostname and invalid origin or exchange fails closed",async()=>{
  const f=fixture({reply:()=>new Response(null,{status:307,headers:{Location:origin+"/x?y=z"}})});
  const result=await forward(req(),f.env,f.send);
  assert.equal(result.headers.get("Location"),"https://"+host+"/x?y=z");
  const badOrigin=fixture({RUN_ORIGIN:"https://x.run.app@elsewhere.test"});
  assert.equal((await forward(req(),badOrigin.env,badOrigin.send)).status,502);
  assert.equal(badOrigin.exchanges.length+badOrigin.upstream.length,0);
  const fail=fixture();
  const result2=await forward(req(),fail.env,async(url)=>{
    assert.equal(url,tokenUrl);
    return new Response("private error detail",{status:403});
  });
  assert.equal(result2.status,502);
  assert.equal(await result2.text(),"Upstream unavailable");
});


test("stage diagnostics disclose only known labels, statuses and OAuth codes", async () => {
  const f = fixture({TEST_HOST: host});
  const send = () => Response.json({error:"invalid_grant", error_description:"private details"}, {status:400});
  const result = await forward(req(), f.env, send);
  assert.equal(result.headers.get("X-Portfolio-Stage-Error"), "token-exchange/400/invalid_grant");
  assert.equal((await forward(req(), fixture().env, send)).headers.has("X-Portfolio-Stage-Error"), false);
  const unknown = await forward(req(), f.env, () => Response.json({error:"private details"}, {status:401}));
  assert.equal(unknown.headers.get("X-Portfolio-Stage-Error"), "token-exchange/401/other");
});

const bundle = "/assets/index-DList-D9.js";

function staticAsset(headers = {}, status = 200) {
  return new Response("bundle contents", { status, headers: {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "application/javascript; charset=utf-8",
    Vary: "Accept-Encoding",
    ...headers,
  }});
}

function edgeCache() {
  const entries = new Map();
  const reads = [];
  const pending = [];
  return {
    entries, reads, pending,
    cache: {
      async match(key) {
        reads.push(key.url);
        assert.equal(key.headers.get("Accept-Encoding"), "identity");
        return entries.get(key.url)?.clone();
      },
      async put(key, response) {
        entries.set(key.url, response);
      },
    },
    context: { waitUntil(task) { pending.push(task); } },
  };
}

test("an immutable bundle is cached per hostname and a hit needs no token or origin", async () => {
  const f = fixture({ reply: () => staticAsset() });
  const { cache, context, pending, entries } = edgeCache();
  const first = await forward(req(bundle, {headers: {"Accept-Encoding": "br, gzip"}}), f.env, f.send, cache, context);
  assert.equal(first.headers.get("X-Portfolio-Asset-Cache"), "MISS");
  assert.equal(await first.text(), "bundle contents");
  assert.equal(f.upstream[0].init.headers.get("Accept-Encoding"), "identity");
  assert.equal(pending.length, 1);
  await Promise.all(pending);
  assert.deepEqual([...entries.keys()], ["https://" + host + bundle]);
  const cold = fixture();
  const hit = await forward(req(bundle), cold.env, cold.send, cache, context);
  assert.equal(await hit.text(), "bundle contents");
  assert.equal(hit.headers.get("X-Portfolio-Asset-Cache"), "HIT");
  assert.equal(hit.headers.get("Vary"), "Accept-Encoding");
  assert.equal(cold.exchanges.length + cold.upstream.length, 0);

  const blog = new Request("https://blog.helloworld0822.xyz" + bundle, {headers: req().headers});
  assert.equal((await forward(blog, f.env, f.send, cache, context)).headers.get("X-Portfolio-Asset-Cache"), "MISS");
  assert.equal(f.upstream.length, 2);
});

test("only plain anonymous bundle GETs use the shared cache", async () => {
  const f = fixture({reply: () => staticAsset()});
  const { cache, context, reads, pending } = edgeCache();
  const requests = [
    req(bundle + "?v=2"), req(bundle + "?"), req("/index.html"), req("/api/assets/index-DList-D9.js"),
    req("/uploads/index-DList-D9.js"), req("/assets/index.js"), req("/assets/index-DList-D9.html"),
    req(bundle, {method:"HEAD"}), req(bundle, {method:"POST"}),
    ...[{Cookie:"s=1"}, {Authorization:"Bearer user"}, {"Proxy-Authorization":"Basic x"},
      {"X-Serverless-Authorization":"Bearer x"}, {Range:"bytes=0-9"}, {"If-Modified-Since":new Date().toUTCString()},
      {"If-None-Match":'"123"'}, {"If-Match":"*"}, {"Cache-Control":"no-cache"}, {Pragma:"no-cache"},
      {"Accept-Encoding":"gzip, identity;q=0"}, {"Accept-Encoding":"br, *;q=0.00"},
    ].map(headers => req(bundle, {headers})),
  ];
  for (const request of requests) {
    const response = await forward(request, f.env, f.send, cache, context);
    assert.equal(response.headers.has("X-Portfolio-Asset-Cache"), false, request.url);
  }
  assert.equal(f.upstream.length, requests.length);
  assert.deepEqual(reads, []);
  assert.deepEqual(pending, []);
});

test("only the expected public, unencoded representation can enter the cache", async () => {
  const { cache, context, entries, pending } = edgeCache();
  for (const response of [
    staticAsset({"Content-Type":"text/html"}), staticAsset({"Set-Cookie":"s=1"}),
    staticAsset({"Cache-Control":"public, max-age=300"}), staticAsset({"Cache-Control":"private, immutable"}),
    staticAsset({"Cache-Control":"public, immutable, no-store"}), staticAsset({"Content-Encoding":"gzip"}),
    staticAsset({Vary:"*"}), staticAsset({Vary:"Accept-Encoding, Cookie"}), staticAsset({}, 500),
    staticAsset({}, 404), staticAsset({Location:"/elsewhere"}, 302), staticAsset({"Content-Range":"bytes 0-1/5"}),
  ]) {
    const f = fixture({reply: () => response});
    const result = await forward(req(bundle), f.env, f.send, cache, context);
    assert.equal(result.headers.has("X-Portfolio-Asset-Cache"), false);
  }
  assert.equal(pending.length, 0);
  assert.equal(entries.size, 0);
  const f = fixture({reply: () => staticAsset({"Content-Type":"text/css"})});
  const css = await forward(req("/assets/index-NNxoA5Ss.css"), f.env, f.send, cache, context);
  assert.equal(css.headers.get("X-Portfolio-Asset-Cache"), "MISS");
  await Promise.all(pending);
  assert.equal(entries.size, 1);
});

test("cache service errors leave the upstream response usable", async () => {
  const {context, pending} = edgeCache();
  const fail = async () => { throw new Error("cache down"); };
  const f = fixture({reply: () => staticAsset()});
  const response = await forward(req(bundle), f.env, f.send, {match:fail, put:fail}, context);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "bundle contents");
  await Promise.all(pending);
});
