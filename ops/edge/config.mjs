import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [mode, testHost] = process.argv.slice(2);
const zone = "helloworld0822.xyz";
const hosts = [zone, "portfolio." + zone, "blog." + zone];
const config = JSON.parse(readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8"));
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
if (!email || !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(email)) {
  throw new Error("Set GOOGLE_SERVICE_ACCOUNT_EMAIL to the dedicated Cloud Run invoker.");
}
config.main = fileURLToPath(new URL("./worker.mjs", import.meta.url));
config.vars.GOOGLE_SERVICE_ACCOUNT_EMAIL = email;
if (process.env.RUN_ORIGIN) {
  const origin = new URL(process.env.RUN_ORIGIN);
  if (origin.protocol !== "https:" || !origin.hostname.endsWith(".run.app") || origin.port ||
      origin.username || origin.password || origin.href !== origin.origin + "/") {
    throw new Error("RUN_ORIGIN must be an HTTPS Cloud Run origin.");
  }
  config.vars.RUN_ORIGIN = origin.origin;
}
if (process.env.GOOGLE_AUDIENCE) config.vars.GOOGLE_AUDIENCE = process.env.GOOGLE_AUDIENCE;
if (mode === "staging") {
  if (!testHost || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.helloworld0822\.xyz$/.test(testHost) || hosts.includes(testHost)) {
    throw new Error("Provide a dedicated unused staging hostname in the helloworld0822.xyz zone.");
  }
  config.vars.TEST_HOST = testHost;
  config.routes = [{ pattern: testHost, custom_domain: true }];
} else if (mode === "production" && !testHost) {
  config.routes = hosts.map((host) => ({ pattern: host + "/*", zone_name: zone }));
} else if (mode !== "unrouted" || testHost) {
  throw new Error("Usage: node ops/edge/config.mjs unrouted | staging <host> | production");
}
process.stdout.write(JSON.stringify(config, null, 2) + "\n");
